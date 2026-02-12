import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { enrichWithTraits, getTimeStatement, processResults } from "./utils/utils.js";
import { getFilterStatement } from "./utils/getFilterStatement.js";

export interface GetJourneyTransitionSessionsRequest {
  Params: { siteId: string };
  Querystring: FilterParams<{
    source: string;
    target: string;
    sourceStep?: string;
    targetStep?: string;
    includeEvents?: string;
    excludeEventNames?: string;
    limit?: string;
    page?: string;
  }>;
}

export async function getJourneyTransitionSessions(
  req: FastifyRequest<GetJourneyTransitionSessionsRequest>,
  res: FastifyReply
) {
  const { siteId } = req.params;
  const {
    source,
    target,
    sourceStep,
    targetStep,
    includeEvents = "true",
    filters,
    limit = "50",
    page = "1",
  } = req.query;

  if (!source || !target) {
    return res.status(400).send({ error: "source and target are required" });
  }

  const includeEventsInJourney = includeEvents === "true" || includeEvents === "1";
  const limitNum = parseInt(limit, 10);
  const pageNum = parseInt(page, 10);
  const offset = (pageNum - 1) * limitNum;

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
    return res.status(400).send({ error: "limit must be between 1 and 200" });
  }

  let query = "";
  let countQuery = "";
  
  try {
    const timeStatement = getTimeStatement(req.query);
    const filterStatement = getFilterStatement(filters, Number(siteId), timeStatement);

    // Parse excludeEventNames if provided
    let excludedEventNames: string[] = [];
    if (req.query.excludeEventNames) {
      try {
        const parsed = JSON.parse(req.query.excludeEventNames);
        if (Array.isArray(parsed)) {
          excludedEventNames = parsed.map((name: any) => String(name).trim()).filter(Boolean);
        } else {
          excludedEventNames = req.query.excludeEventNames.split(",").map((name: string) => name.trim()).filter(Boolean);
        }
      } catch {
        excludedEventNames = req.query.excludeEventNames.split(",").map((name: string) => name.trim()).filter(Boolean);
      }
    }

    // Build the step label format function (same as in getJourneys)
    const stepLabelCase = `
      CASE
        WHEN type = 'pageview' THEN 
          CASE
            WHEN startsWith(pathname, '/asset/draft/') THEN '/asset/draft'
            ELSE pathname
          END
        WHEN type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound') THEN
          CONCAT('event:', type, IF(event_name != '' AND event_name IS NOT NULL, CONCAT(':', event_name), ''))
        ELSE 
          CASE
            WHEN startsWith(pathname, '/asset/draft/') THEN '/asset/draft'
            ELSE pathname
          END
      END AS step_label
    `;

    // Query to find sessions that have the specific transition (source -> target)
    // We need to find sessions where source appears before target in the sequence
    query = `
      WITH user_paths AS (
        SELECT
          session_id,
          arrayCompact(groupArray(step_label)) AS path_sequence,
          groupArray(timestamp) AS timestamps
        FROM (
          SELECT
            session_id,
            timestamp,
            ${stepLabelCase}
          FROM events
          WHERE
            site_id = {siteId:Int32}
            ${timeStatement || ""}
            ${filterStatement || ""}
            AND (
              type = 'pageview'
              ${includeEventsInJourney ? "OR type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound')" : ""}
            )
            ${excludedEventNames.length > 0 
              ? `AND NOT (type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound') AND event_name IN (${excludedEventNames.map(name => `'${name.replace(/'/g, "''")}'`).join(", ")}))` 
              : ""}
          ORDER BY session_id, timestamp
        )
        GROUP BY session_id
        HAVING length(path_sequence) >= 2
      ),
      matching_sessions AS (
        SELECT
          session_id,
          arrayIndexOf(path_sequence, {source:String}) AS source_index,
          arrayIndexOf(path_sequence, {target:String}) AS target_index,
          arrayElement(timestamps, arrayIndexOf(path_sequence, {source:String})) AS transition_timestamp
        FROM user_paths
        WHERE 
          arrayIndexOf(path_sequence, {source:String}) > 0 
          AND arrayIndexOf(path_sequence, {target:String}) > 0 
          AND arrayIndexOf(path_sequence, {source:String}) < arrayIndexOf(path_sequence, {target:String})
          ${sourceStep ? `AND arrayIndexOf(path_sequence, {source:String}) = ${parseInt(sourceStep, 10) + 1}` : ""}
          ${targetStep ? `AND arrayIndexOf(path_sequence, {target:String}) = ${parseInt(targetStep, 10) + 1}` : ""}
      )
      SELECT
        ms.session_id,
        ms.source_index,
        ms.target_index,
        ms.transition_timestamp,
        argMax(e.user_id, e.timestamp) AS user_id,
        argMax(e.identified_user_id, e.timestamp) AS identified_user_id,
        argMax(e.country, e.timestamp) AS country,
        argMax(e.region, e.timestamp) AS region,
        argMax(e.city, e.timestamp) AS city,
        argMax(e.language, e.timestamp) AS language,
        argMax(e.device_type, e.timestamp) AS device_type,
        argMax(e.browser, e.timestamp) AS browser,
        argMax(e.browser_version, e.timestamp) AS browser_version,
        argMax(e.operating_system, e.timestamp) AS operating_system,
        argMax(e.operating_system_version, e.timestamp) AS operating_system_version,
        argMax(e.screen_width, e.timestamp) AS screen_width,
        argMax(e.screen_height, e.timestamp) AS screen_height,
        argMin(e.referrer, e.timestamp) AS referrer,
        argMin(e.channel, e.timestamp) AS channel,
        argMin(e.hostname, e.timestamp) AS hostname,
        MIN(e.timestamp) AS session_start,
        MAX(e.timestamp) AS session_end,
        dateDiff('second', MIN(e.timestamp), MAX(e.timestamp)) AS session_duration,
        argMinIf(e.pathname, e.timestamp, e.type = 'pageview') AS entry_page,
        argMaxIf(e.pathname, e.timestamp, e.type = 'pageview') AS exit_page,
        countIf(e.type = 'pageview') AS pageviews,
        countIf(e.type = 'custom_event') AS events,
        argMax(e.ip, e.timestamp) AS ip
      FROM matching_sessions ms
      INNER JOIN events e ON ms.session_id = e.session_id
      WHERE e.site_id = {siteId:Int32}
        ${timeStatement || ""}
      GROUP BY ms.session_id, ms.source_index, ms.target_index, ms.transition_timestamp
      ORDER BY transition_timestamp DESC
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    `;

    const result = await clickhouse.query({
      query,
      format: "JSONEachRow",
      query_params: {
        siteId: parseInt(siteId, 10),
        source: source,
        target: target,
        limit: limitNum,
        offset: offset,
      },
    });

    const sessions = await processResults<any>(result);

    // Enrich with traits from Postgres
    const sessionsWithTraits = await enrichWithTraits(sessions, Number(siteId));

    // Get total count
    countQuery = `
      WITH user_paths AS (
        SELECT
          session_id,
          arrayCompact(groupArray(step_label)) AS path_sequence
        FROM (
          SELECT
            session_id,
            timestamp,
            ${stepLabelCase}
          FROM events
          WHERE
            site_id = {siteId:Int32}
            ${timeStatement || ""}
            ${filterStatement || ""}
            AND (
              type = 'pageview'
              ${includeEventsInJourney ? "OR type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound')" : ""}
            )
            ${excludedEventNames.length > 0 
              ? `AND NOT (type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound') AND event_name IN (${excludedEventNames.map(name => `'${name.replace(/'/g, "''")}'`).join(", ")}))` 
              : ""}
          ORDER BY session_id, timestamp
        )
        GROUP BY session_id
        HAVING length(path_sequence) >= 2
      )
      SELECT count(DISTINCT session_id) AS total
      FROM user_paths
      WHERE 
        arrayIndexOf(path_sequence, {source:String}) > 0 
        AND arrayIndexOf(path_sequence, {target:String}) > 0 
        AND arrayIndexOf(path_sequence, {source:String}) < arrayIndexOf(path_sequence, {target:String})
        ${sourceStep ? `AND arrayIndexOf(path_sequence, {source:String}) = ${parseInt(sourceStep, 10) + 1}` : ""}
        ${targetStep ? `AND arrayIndexOf(path_sequence, {target:String}) = ${parseInt(targetStep, 10) + 1}` : ""}
    `;

    const countResult = await clickhouse.query({
      query: countQuery,
      format: "JSONEachRow",
      query_params: {
        siteId: parseInt(siteId, 10),
        source: source,
        target: target,
      },
    });

    const countData = await processResults<{ total: number }>(countResult);
    const total = countData[0]?.total || 0;

    return res.send({
      data: sessionsWithTraits,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error getting journey transition sessions:", error);
    if (query) {
      console.error("Query:", query);
    }
    if (countQuery) {
      console.error("Count Query:", countQuery);
    }
    console.error("Query params:", {
      siteId: parseInt(siteId, 10),
      source: source,
      target: target,
      limit: limitNum,
      offset: offset,
    });
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return res.status(500).send({ 
      error: "Failed to get journey transition sessions",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
