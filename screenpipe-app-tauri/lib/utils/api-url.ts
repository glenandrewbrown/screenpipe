export const DEFAULT_PORT = 3030;

export function getBaseHttpUrl(port: number = DEFAULT_PORT): string {
  return `http://localhost:${port}`;
}

export function getBaseWsUrl(port: number = DEFAULT_PORT): string {
  return `ws://localhost:${port}`;
}

export function getStreamFramesUrl(port: number = DEFAULT_PORT): string {
  return `${getBaseWsUrl(port)}/stream/frames`;
}

export function getHealthWsUrl(port: number = DEFAULT_PORT): string {
  return `${getBaseWsUrl(port)}/ws/health`;
}

export function getRawSqlUrl(port: number = DEFAULT_PORT): string {
  return `${getBaseHttpUrl(port)}/raw_sql`;
}

export function getFrameUrl(frameId: string, port: number = DEFAULT_PORT): string {
  return `${getBaseHttpUrl(port)}/frames/${frameId}`;
}

export function getFrameOcrUrl(frameId: string, port: number = DEFAULT_PORT): string {
  return `${getBaseHttpUrl(port)}/frames/${frameId}/ocr`;
}

export function getSearchUrl(port: number = DEFAULT_PORT): string {
  return `${getBaseHttpUrl(port)}/search/keyword`;
}

export function getPipesListUrl(port: number = DEFAULT_PORT): string {
  return `${getBaseHttpUrl(port)}/pipes/list`;
}

export function getFramesExportWsUrl(
  frameIds: string[],
  fps: number,
  port: number = DEFAULT_PORT,
): string {
  return `${getBaseWsUrl(port)}/frames/export?frame_ids=${frameIds.join(",")}&fps=${fps}`;
}
