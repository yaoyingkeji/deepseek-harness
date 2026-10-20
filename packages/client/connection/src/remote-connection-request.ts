/**
 * Facts about one remote (non-local) connection request reaching this Host.
 *
 * The event is the Host's own statement that a caller outside the local
 * machine asked to connect: it names the authority that asked, the Peer the
 * admission produced, and whether that Peer may answer forwarded human
 * interactions. It carries no credential and no request body.
 *
 * The module is browser-safe on purpose: the Host emits the event and the
 * Client subscribes to it, so both compilation faces read one declaration.
 */

/** One remote connection request admitted by the Host. */
export interface RemoteConnectionRequest {
  /** Authority that opened the request, verbatim from the `Host` header. */
  readonly authority: string
  /** The Peer the admission produced for this connection. */
  readonly peerId: string
  /** Whether the admitted Peer may answer forwarded human interactions. */
  readonly interactions: 'answer' | 'none'
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A caller outside this machine asked to connect and was admitted.
     *
     * This is the remote-connection request itself, not a proxy for it: a new
     * local Session, a new subagent, or any other local activity never emits
     * it. The authority names the host the request came from; the Peer is the
     * one the admission produced.
     * @param request - Admitted connection facts.
     * @mode emit
     */
    'connection/remote-requested'(request: RemoteConnectionRequest): void
  }
}
