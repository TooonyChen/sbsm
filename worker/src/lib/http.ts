export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...headers },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    status,
  );
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch (error) {
    console.error('Failed to parse JSON body', error);
    return null;
  }
}
