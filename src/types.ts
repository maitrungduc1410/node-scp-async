import type {
  AcceptConnection,
  ChangePasswordCallback,
  ClientChannel,
  ClientErrorExtensions,
  KeyboardInteractiveCallback,
  NegotiatedAlgorithms,
  ParsedKey,
  Prompt,
  RejectConnection,
  TcpConnectionDetails,
  UNIXConnectionDetails,
  X11Details,
} from "ssh2";

export class ErrorCustom extends Error {
  custom?: boolean;
  code?: string;
  level?: string;
  hostname?: string;
  address?: string;
}
export interface CheckResult {
  path: string;
  type?: string;
  valid?: boolean;
  msg?: string;
  code?: string;
}

export interface ClientEvents {
  /**
   * Emitted when a notice was sent by the server upon connection.
   */
  banner?: (message: string) => void;

  /**
   * Emitted when authentication was successful.
   */
  ready?: () => void;

  /**
   * Emitted when an incoming forwarded TCP connection is being requested.
   *
   * Calling `accept()` accepts the connection and returns a `Channel` object.
   * Calling `reject()` rejects the connection and no further action is needed.
   */
  "tcp connection"?: (
    details: TcpConnectionDetails,
    accept: AcceptConnection<ClientChannel>,
    reject: RejectConnection
  ) => void;

  /**
   * Emitted when an incoming X11 connection is being requested.
   *
   * Calling `accept()` accepts the connection and returns a `Channel` object.
   * Calling `reject()` rejects the connection and no further action is needed.
   */
  x11?: (
    details: X11Details,
    accept: AcceptConnection<ClientChannel>,
    reject: RejectConnection
  ) => void;

  /**
   * Emitted when the server is asking for replies to the given `prompts` for keyboard-
   * interactive user authentication.
   *
   * * `name` is generally what you'd use as a window title (for GUI apps).
   * * `prompts` is an array of `Prompt` objects.
   *
   * The answers for all prompts must be provided as an array of strings and passed to
   * `finish` when you are ready to continue.
   *
   * NOTE: It's possible for the server to come back and ask more questions.
   */
  "keyboard-interactive"?: (
    name: string,
    instructions: string,
    lang: string,
    prompts: Prompt[],
    finish: KeyboardInteractiveCallback
  ) => void;

  /**
   * Emitted when the server has requested that the user's password be changed, if using
   * password-based user authentication.
   *
   * Call `done` with the new password.
   */
  "change password"?: (message: string, done: ChangePasswordCallback) => void;

  /**
   * Emitted when an error occurred.
   */
  error?: (err: Error & ClientErrorExtensions) => void;

  /**
   * Emitted when the socket was disconnected.
   */
  end?: () => void;

  /**
   * Emitted when the socket was closed.
   */
  close?: () => void;

  /**
   * Emitted when the socket has timed out.
   */
  timeout?: () => void;

  /**
   * Emitted when the socket has connected.
   */
  connect?: () => void;

  /**
   * Emitted when the server responds with a greeting message.
   */
  greeting?: (greeting: string) => void;

  /**
   * Emitted when a handshake has completed (either initial or rekey).
   */
  handshake?: (negotiated: NegotiatedAlgorithms) => void;

  /**
   * Emitted when the server announces its available host keys.
   */
  hostkeys?: (keys: ParsedKey[]) => void;

  /**
   * An incoming forwarded UNIX socket connection is being requested.
   */
  "unix connection"?: (
    info: UNIXConnectionDetails,
    accept: AcceptConnection,
    reject: RejectConnection
  ) => void;
}
