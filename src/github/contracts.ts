// Transport types only. The editor and local draft model do not depend on GitHub.
export interface GithubRepository {
  name: string
  branch: string
  contentRoot: string
}

export interface GithubSession {
  configured: boolean
  user?: { id: number; login: string }
  csrf?: string
  repository?: GithubRepository
}

export interface GithubImage {
  name: string
  sha: string
  size: number
}

export interface GithubArticle {
  path: string
  ref: string
  commit: string
  source: string
  images: GithubImage[]
}

export interface GithubSaveInput {
  mode: 'direct'
  create: boolean
  path: string
  ref: string
  commit: string
  source: string
  requestId: string
  images: { name: string; sha: string; ticket?: string }[]
}

export interface GithubSaveResult {
  ref: string
  commit: string
  url: string
}

export interface GithubDeleteInput {
  path: string
  ref: string
  commit: string
  requestId: string
}

// Conservative sizes also work on deployments with a 4.5 MB function payload cap.
export const GITHUB_IMAGE_LIMIT = 2 * 1024 * 1024
export const GITHUB_SOURCE_LIMIT = 512 * 1024
export const GITHUB_IMAGE_COUNT = 50
