import * as https from 'https'
import * as Koa from 'koa'
import * as KoaRouter from 'koa-router'
import * as mongoose from 'mongoose'

export interface IServerAppConfig {
  name: string

  mongoUris?: string

  httpServers?: {
    path?: string,
    port: number
  }[]

  httpsServers?: {
    opts: https.ServerOptions
    path?: string,
    port: number
  }[]

  publicDirs?: string[]

  models?: mongoose.Model<mongoose.Document>[]

  routers?: KoaRouter[]

  sockets?: SocketIO.Server[]

  log?: boolean

  compress?: boolean

  bodyParser?: boolean

  json?: boolean

  cacheControl?: string

  middleware?: Koa.Middleware[]

}
