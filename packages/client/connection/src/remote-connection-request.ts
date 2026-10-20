/**
 * Facts about one remote (non-local) connection request reaching this Host.
 *
 * The event is the Host's own statement that a caller outside the local
 * machine asked to connect: it names the authority that asked, the Peer the
 * admission produced, and whether that Peer may answer forwarded human
 * interactions. It carries no credential and no request body.
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
