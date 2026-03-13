export function createMockLoaderArgs(
  url: string,
  params: Record<string, string> = {}
) {
  return {
    request: new Request(`http://localhost${url}`),
    params,
    context: {},
  };
}

export function createMockActionArgs(
  method: string,
  url: string,
  body: unknown = {},
  params: Record<string, string> = {}
) {
  return {
    request: new Request(`http://localhost${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params,
    context: {},
  };
}

export async function getJsonResponse(response: Response): Promise<unknown> {
  return response.json();
}
