import type { PoolClient } from "pg";
import { APP_PROFILE_ID, APP_PROFILE_NAME } from "@/config/app";
import { sanitizarResumen } from "@/core/analisis/resumen";
import type { CambiosEstado } from "@/core/estado/cambios";
import { MAX_CVS, sanitizarPerfil, type EstadoPerfil, type PerfilCv } from "@/core/perfil/perfil";
import { detectarAlertas } from "@/core/radar/radar";
import { analizarOferta, sanitizar, type Postulacion } from "@/core/seguimiento/seguimiento";
import { ErrorHttp } from "./api";
import { getPool, withTransaction } from "./db";

export interface EstadoPersistido {
  perfil: EstadoPerfil;
  postulaciones: Postulacion[];
}

function isoSeguro(valor: unknown, porDefecto = new Date(0).toISOString()): string {
  const fecha = new Date(typeof valor === "string" || valor instanceof Date ? valor : String(valor ?? ""));
  return Number.isNaN(fecha.getTime()) ? porDefecto : fecha.toISOString();
}

function resumenSeguro(valor: unknown) {
  const resumen = sanitizarResumen(valor);
  if (!resumen) throw new ErrorHttp(400, "Resumen de análisis inválido.");
  return resumen;
}

async function guardarCv(client: PoolClient, cv: PerfilCv) {
  await client.query(
    `
      insert into cvs (id, profile_id, nombre, texto, actualizado_en, estructurado_json, estructurado_editado, created_at, updated_at)
      values ($1, $2, $3, $4, $5::timestamptz, $6::jsonb, $7, now(), now())
      on conflict (id) do update set
        nombre = excluded.nombre, texto = excluded.texto, actualizado_en = excluded.actualizado_en,
        estructurado_json = excluded.estructurado_json, estructurado_editado = excluded.estructurado_editado, updated_at = now()
      where cvs.profile_id = excluded.profile_id
    `,
    [
      cv.id,
      APP_PROFILE_ID,
      cv.nombre,
      cv.texto,
      isoSeguro(cv.actualizadoEn),
      cv.estructurado ? JSON.stringify(cv.estructurado) : null,
      cv.estructuradoEditado === true,
    ],
  );
}

/** El CV activo que pediste si existe; si no (o si lo borraste), el primero que quede. */
async function fijarCvActivo(client: PoolClient, cvs: string[], pedido: string | null | undefined) {
  const { rows } = await client.query<{ active_cv_id: string | null }>(`select active_cv_id from profiles where id = $1`, [APP_PROFILE_ID]);
  const deseado = pedido !== undefined ? pedido : (rows[0]?.active_cv_id ?? null);
  const activo = deseado && cvs.includes(deseado) ? deseado : (cvs[0] ?? null);
  await client.query(`update profiles set active_cv_id = $2, updated_at = now() where id = $1 and active_cv_id is distinct from $2`, [APP_PROFILE_ID, activo]);
}

/** Quita postulaciones con su oferta y su análisis (las alertas del radar se van en cascada). */
async function borrarPostulaciones(client: PoolClient, ids: string[]) {
  if (!ids.length) return;
  await client.query(`delete from tracker_entries where profile_id = $1 and id = any($2::text[])`, [APP_PROFILE_ID, ids]);
  await client.query(`delete from job_postings where profile_id = $1 and id = any($2::text[])`, [APP_PROFILE_ID, ids]);
}

async function insertarPostulacion(client: PoolClient, postulacion: Postulacion, cvMap: Map<string, string>) {
  let jobPostingId: string | null = null;
  let analysisResultId: string | null = null;

  if (postulacion.oferta) {
    const fechaAnalisis = isoSeguro(postulacion.oferta.resumen.analizadaEn, isoSeguro(postulacion.actualizadaEn));
    const momento = new Date(fechaAnalisis);
    const cvTexto = postulacion.oferta.cvId ? cvMap.get(postulacion.oferta.cvId) : undefined;
    const snapshot = cvTexto
      ? analizarOferta(cvTexto, postulacion.oferta.texto, postulacion.oferta.cvId, momento)
      : { ...postulacion.oferta, resumen: resumenSeguro(postulacion.oferta.resumen) };
    const radar = detectarAlertas(postulacion.oferta.texto, momento);
    jobPostingId = postulacion.id;
    analysisResultId = postulacion.id;

    await client.query(
      `
        insert into job_postings (
          id, profile_id, cv_id, empresa, puesto, source_url, raw_text, summary_json, score, risk_level, analyzed_at, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::timestamptz, now(), now()
        )
      `,
      [
        jobPostingId,
        APP_PROFILE_ID,
        snapshot.cvId ?? null,
        postulacion.empresa,
        postulacion.puesto,
        postulacion.url ?? null,
        snapshot.texto,
        JSON.stringify(snapshot.resumen),
        snapshot.resumen.score,
        radar.nivel,
        fechaAnalisis,
      ],
    );

    await client.query(
      `
        insert into analysis_results (
          id, profile_id, job_posting_id, cv_id, summary_json, score, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, now()
        )
      `,
      [
        analysisResultId,
        APP_PROFILE_ID,
        jobPostingId,
        snapshot.cvId ?? null,
        JSON.stringify(snapshot.resumen),
        snapshot.resumen.score,
        fechaAnalisis,
      ],
    );

    for (const alerta of radar.alertas) {
      await client.query(
        `
          insert into radar_flags (analysis_result_id, flag_key, severidad, titulo, detalle, evidencia)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [analysisResultId, alerta.id, alerta.severidad, alerta.titulo, alerta.detalle, alerta.evidencia ?? null],
      );
    }
  }

  await client.query(
    `
      insert into tracker_entries (
        id, profile_id, job_posting_id, analysis_result_id, empresa, puesto, source_url, score, notas,
        estado, creada_en, actualizada_en, postulada_en, seguimiento_en, sello_json, historial_json
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11::timestamptz, $12::timestamptz, $13::timestamptz, $14::timestamptz, $15::jsonb, $16::jsonb
      )
    `,
    [
      postulacion.id,
      APP_PROFILE_ID,
      jobPostingId,
      analysisResultId,
      postulacion.empresa,
      postulacion.puesto,
      postulacion.url ?? null,
      postulacion.score ?? null,
      postulacion.notas ?? null,
      postulacion.estado,
      isoSeguro(postulacion.creadaEn),
      isoSeguro(postulacion.actualizadaEn),
      postulacion.postuladaEn ? isoSeguro(postulacion.postuladaEn) : null,
      postulacion.seguimientoEn ? isoSeguro(postulacion.seguimientoEn) : null,
      JSON.stringify(postulacion.sello ?? null),
      JSON.stringify(postulacion.historial),
    ],
  );
}

export async function loadState(): Promise<EstadoPersistido> {
  const pool = getPool();
  const profileResult = await pool.query(
    `select active_cv_id, respuestas_json from profiles where id = $1 limit 1`,
    [APP_PROFILE_ID],
  );
  const cvsResult = await pool.query(
    `
      select id, nombre, texto, actualizado_en, estructurado_json, estructurado_editado
      from cvs
      where profile_id = $1
      order by created_at asc, nombre asc
    `,
    [APP_PROFILE_ID],
  );
  const trackerResult = await pool.query(
    `
      select
        te.id,
        te.empresa,
        te.puesto,
        te.source_url,
        te.score,
        te.notas,
        te.estado,
        te.creada_en,
        te.actualizada_en,
        te.postulada_en,
        te.seguimiento_en,
        te.sello_json,
        te.historial_json,
        jp.raw_text,
        jp.cv_id,
        ar.summary_json
      from tracker_entries te
      left join job_postings jp on jp.id = te.job_posting_id
      left join analysis_results ar on ar.id = te.analysis_result_id
      where te.profile_id = $1
      order by te.creada_en desc
    `,
    [APP_PROFILE_ID],
  );

  const perfil = sanitizarPerfil({
    activoId: profileResult.rows[0]?.active_cv_id ?? null,
    respuestas: profileResult.rows[0]?.respuestas_json,
    cvs: cvsResult.rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      texto: row.texto,
      actualizadoEn: isoSeguro(row.actualizado_en),
      estructurado: row.estructurado_json ?? undefined,
      estructuradoEditado: row.estructurado_editado === true,
    })),
  });

  const postulaciones = sanitizar(
    trackerResult.rows.map((row) => ({
      id: row.id,
      empresa: row.empresa,
      puesto: row.puesto,
      url: row.source_url ?? undefined,
      score: typeof row.score === "number" ? row.score : undefined,
      notas: row.notas ?? undefined,
      estado: row.estado,
      creadaEn: isoSeguro(row.creada_en),
      actualizadaEn: isoSeguro(row.actualizada_en),
      postuladaEn: row.postulada_en ? isoSeguro(row.postulada_en) : undefined,
      seguimientoEn: row.seguimiento_en ? isoSeguro(row.seguimiento_en) : undefined,
      sello: row.sello_json ?? undefined,
      historial: Array.isArray(row.historial_json) ? row.historial_json : [],
      oferta: typeof row.raw_text === "string" && row.raw_text.trim() && row.summary_json
        ? { texto: row.raw_text, cvId: typeof row.cv_id === "string" ? row.cv_id : undefined, resumen: row.summary_json }
        : undefined,
    })),
  ).items;

  return { perfil, postulaciones };
}

/**
 * Escribe solo lo que cambió (ver core/estado/cambios), renglón por renglón: lo que no viene en los cambios queda tal
 * cual. Así dos escritores (esta pestaña, otra pestaña, la extensión) no se pisan: el último no borra lo del otro.
 */
export async function aplicarCambios(cambios: CambiosEstado): Promise<EstadoPersistido> {
  await withTransaction(async (client) => {
    await client.query(
      `insert into profiles (id, display_name, respuestas_json, created_at, updated_at) values ($1, $2, '{}'::jsonb, now(), now()) on conflict (id) do nothing`,
      [APP_PROFILE_ID, APP_PROFILE_NAME],
    );
    if (cambios.respuestas) {
      await client.query(`update profiles set respuestas_json = $2::jsonb, updated_at = now() where id = $1`, [APP_PROFILE_ID, JSON.stringify(cambios.respuestas)]);
    }

    for (const cv of cambios.cvs?.guardar ?? []) await guardarCv(client, cv);
    if (cambios.cvs?.borrar.length) await client.query(`delete from cvs where profile_id = $1 and id = any($2::text[])`, [APP_PROFILE_ID, cambios.cvs.borrar]);
    const { rows: cvs } = await client.query<{ id: string; texto: string }>(
      `select id, texto from cvs where profile_id = $1 order by created_at asc, nombre asc`,
      [APP_PROFILE_ID],
    );
    if (cvs.length > MAX_CVS) throw new ErrorHttp(400, `Puedes guardar hasta ${MAX_CVS} CVs. Borra uno antes de agregar otro.`);
    await fijarCvActivo(client, cvs.map((cv) => cv.id), cambios.activoId);

    const postulaciones = cambios.postulaciones;
    if (postulaciones) {
      // Modificar = reemplazar ese renglón (con su oferta y su análisis); las demás postulaciones no se tocan.
      await borrarPostulaciones(client, [...postulaciones.borrar, ...postulaciones.guardar.map((p) => p.id)]);
      const cvMap = new Map(cvs.map((cv) => [cv.id, cv.texto]));
      for (const postulacion of postulaciones.guardar) await insertarPostulacion(client, postulacion, cvMap);
    }
  });
  return loadState();
}

export async function clearState(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`delete from profiles where id = $1`, [APP_PROFILE_ID]);
  });
}

