import { betterAuth } from "better-auth"
import { openAPI } from "better-auth/plugins"
import { Database } from "bun:sqlite"

const db = new Database("./finanza.db")
export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true
  },
  plugins: [openAPI()]
})