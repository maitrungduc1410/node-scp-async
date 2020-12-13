export class ErrorCustom extends Error {
  custom?: boolean
  code?: string
  level?: string
  hostname?: string
  address?: string
}
export interface CheckResult {
  path: string,
  type?: string,
  valid?: boolean,
  msg?: string,
  code?: string
}