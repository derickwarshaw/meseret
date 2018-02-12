import * as http from 'http'
import * as https from 'https'
import * as Koa from 'koa'
import * as KoaCompress from 'koa-compress'
import * as KoaConvert from 'koa-convert'
import * as KoaBodyparser from 'koa-bodyparser'
import * as KoaJson from 'koa-json'
import * as KoaLogger from 'koa-logger'
import * as KoaSend from 'koa-send'
import * as KoaStatic from 'koa-static'
import * as KoaStaticCache from 'koa-static-cache'
import * as KoaSession from 'koa-session'
import * as mongoose from 'mongoose'
import * as net from 'net'

import { IServerAppConfig } from './IServerAppConfig'

export class ServerApp {
  private _dbConn?: mongoose.Connection
  private _app: Koa = new Koa()
  private _servers: net.Server[] = []

  get dbConn (): mongoose.Connection | undefined {
    return this._dbConn
  }

  get app (): Koa {
    return this._app
  }

  get servers (): net.Server[] {
    return this._servers
  }

  constructor (public readonly config: IServerAppConfig) { }

  async start (): Promise<void> {

    /* MONGOOSE */

    try {
      // mongoose models are automatically created at the origins of this.config.model

      if (this.config.mongoUris) { // if mongoUris in config...
        // connect to db
        try {
          await mongoose.connect(this.config.mongoUris) // todo: feature request: auth (user & pass) support for db
          this._dbConn = mongoose.connection
          console.log(`Database connected to ${this.config.mongoUris}.`)
        } catch (err) {
          err.message = `Database connection error: ${err.message}`
          return Promise.reject(err)
        }
      } else if (this.config.models) { // else if there are models but no mongoUris... what are they for?
        return Promise.reject(new Error('No MongoDB URI to load the provided models on.'))
      }
    } catch (err) {
      err.message = `Mongoose setup error: ${err.message}`
      return Promise.reject(err)
    }

    /* KOA */

    try {
      // set keys
      if (this.config.keys) this.app.keys = this.config.keys

      // use the essential koa middleware
      if (this.config.log !== false) this.app.use(KoaLogger())
      if (this.config.session !== false && Array.isArray(this.app.keys) && this.app.keys.length) this.app.use(KoaSession(this.app))
      if (this.config.compress !== false) this.app.use(KoaCompress({ level: 9, memLevel: 9, threshold: 0 }))
      if (this.config.bodyParser !== false) this.app.use(KoaBodyparser({ enableTypes: ['json', 'form', 'text'] }))
      if (this.config.json !== false) this.app.use(KoaJson({ pretty: this.app.env === 'development' }))

      // use provided public directories (with static cache)
      if (this.config.publicDirs) {
        for (const dir of this.config.publicDirs) {
          this.app.use(KoaStaticCache(dir, { cacheControl: this.config.cacheControl || 'private' }))
          this.app.use(KoaStatic(dir, {
            gzip: this.config.compress === true || this.config.compress === false ? this.config.compress : true
          }))
        }
      }

      // use provided middleware
      if (this.config.middleware) for (const m of this.config.middleware) this.app.use(KoaConvert.compose(m))

      // use provided routers
      if (this.config.routers) for (const r of this.config.routers) this.app.use(r.routes()).use(r.allowedMethods())

      // 404 => SPA?
      if (this.config.spaFileRelativePath) {
        this.app.use(async ctx => {
          if (ctx.status === 404) {
            await KoaSend(ctx, this.config.spaFileRelativePath as string)
              .catch(err => console.error(`Error sending the specified SPA file: ${err}`))
          }
        })
      }

      // create and listen on all https servers
      if (this.config.httpsServers) {
        for (const s of this.config.httpsServers) {
          const server = https.createServer(s.opts, this.app.callback()).listen(s.port, s.path, (err: any) => {
            if (err) {
              err.message = `HTTPS server creation error: ${err.message}`
              return Promise.reject(err)
            }

            const address = server.address()
            console.log(`Listening at https://${address.address}:${address.port}/ in ${this.app.env} mode.`)
          })
          this.servers.push(server)
        }
      }

      // create and listen on all http servers
      if (this.config.httpServers) {
        for (const s of this.config.httpServers) {
          const server = http.createServer(this.app.callback()).listen(s.port, s.path, (err: any) => {
            if (err) {
              err.message = `HTTP server creation error: ${err.message}`
              return Promise.reject(err)
            }

            const address = server.address()
            console.log(`Listening at http://${address.address}:${address.port}/ in ${this.app.env} mode.`)
          })
          this.servers.push(server)
        }
      }

      // attach sockets to the servers
      if (this.config.sockets) {
        for (const socket of this.config.sockets) {
          for (const server of this.servers) {
            socket.attach(server)
          }
        }
      }

      return Promise.resolve()
    } catch (err) {
      err.message = `Koa setup error: ${err.message}`
      return Promise.reject(err)
    }
  }
}
