// In-app "back" for the Android back button/gesture and the on-screen back arrows.
// A screen with its own inner steps (an open chat, an open sheet) registers a
// handler; the newest handler gets the first chance. When none takes it, back
// goes to the previous page, and on the home screen the app closes.

type BackHandler = () => boolean; // true = handled

const handlers: BackHandler[] = [];

/** Register an inner back step. Returns the unregister function. */
export function onBack(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i !== -1) handlers.splice(i, 1);
  };
}

/** Let the newest registered handler take the back press. */
export function runBackHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true;
  }
  return false;
}

/** Home = the chat landing (or the bare entry page). Back there closes the app. */
export function isHomePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/" || p === "/chat";
}
