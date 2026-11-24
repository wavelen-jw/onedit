/** Presentation admission only. Host authentication and file ownership remain separate. */
export function approvedEmbedChrome(doc: Document): boolean {
  const view=doc.defaultView;
  if(!view||view.parent===view)return false;
  const path=view.location.pathname;
  if(path!=="/ai/editor/"&&path!=="/ai/terra/editor/")return false;
  const markers=doc.head.querySelectorAll('meta[name="onedit-embed-chrome"]');
  return markers.length===1&&markers[0].getAttribute("content")==="modern-v1";
}

/** The hosted test workspace grants browser-local file commands on the same origin. */
export function approvedLocalWorkspace(doc: Document): boolean {
  const view = doc.defaultView;
  if (!view || view.parent === view || view.location.pathname !== "/ai/editor/") return false;
  const markers = doc.head.querySelectorAll('meta[name="onedit-local-workspace"]');
  if (markers.length !== 1 || markers[0].getAttribute("content") !== view.location.origin) return false;
  try { return view.parent.location.origin === view.location.origin; }
  catch { return false; }
}
