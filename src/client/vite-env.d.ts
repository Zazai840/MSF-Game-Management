/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** This build's id, set by the app-shell build step; the server sends the id of the build it serves. */
  readonly BUILD_ID:string;
}
