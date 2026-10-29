// ROADMAP D.4 (decisión 145) — POST /theme: guarda la preferencia de tema en
// una cookie y responde 303 hacia la ruta de retorno. Solo exporta POST; GET
// devuelve 405 por defecto. La lógica vive en `server/theme-preference`.
import {
  buildBadRequestResponse,
  buildSeeOtherResponse,
  buildThemeCookie,
  isSecureRequest,
  resolveReturnPath,
  themeChoiceSchema,
} from '../../server/theme-preference';

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return buildBadRequestResponse();
  }

  const choice = themeChoiceSchema.safeParse(form.get('theme'));
  if (!choice.success) {
    return buildBadRequestResponse();
  }

  const location = resolveReturnPath({
    returnTo: form.get('returnTo'),
    referer: request.headers.get('referer'),
    requestUrl: request.url,
    host: request.headers.get('host'),
  });
  const secure = isSecureRequest(request.url, request.headers.get('x-forwarded-proto'));
  return buildSeeOtherResponse(location, buildThemeCookie(choice.data, secure));
}
