/** Presentation admission only. Host authentication and file ownership remain separate. */
export function approvedEmbedChrome(doc: Document): boolean {
  const view=doc.defaultView;
  if(!view||view.parent===view)return false;
  const path=view.location.pathname;
  if(path!=="/ai/editor/"&&path!=="/ai/terra/editor/")return false;
  const markers=doc.head.querySelectorAll('meta[name="onedit-embed-chrome"]');
  return markers.length===1&&markers[0].getAttribute("content")==="modern-v1";
}
