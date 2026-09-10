const LEGACY_HOST = "site-18-kelegance.pages.dev";
const PRIMARY_ORIGIN = "https://elegance18k.com";

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  if (url.hostname === LEGACY_HOST && !url.pathname.startsWith("/api/")) {
    const destination = new URL(url.pathname + url.search, PRIMARY_ORIGIN);
    return Response.redirect(destination.toString(), 308);
  }

  return context.next();
};
