const INTERNAL_UPSTREAM_FETCH_LIMIT = '15000';
const INTERNAL_PREVIEW_RECORD_LIMIT = '1000';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  if (url.pathname === '/api/analytics') {
    if (!url.searchParams.has('maxRows') && !url.searchParams.has('limit')) {
      url.searchParams.set('maxRows', INTERNAL_UPSTREAM_FETCH_LIMIT);
    }

    if (!url.searchParams.has('recordLimit')) {
      url.searchParams.set('recordLimit', INTERNAL_PREVIEW_RECORD_LIMIT);
    }

    const request = new Request(url.toString(), context.request);
    return context.next(request);
  }

  return context.next();
};
