import { createContext } from 'react'

export const BlockMediaContext = createContext<ReadonlyMap<string, string>>(new Map())
