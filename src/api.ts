import { Elysia, t } from "elysia"
import { openapi } from "@elysia/openapi"
import { auth } from "./lib/auth"

import { IdGenerator } from "./lib/id-generator"
import { stat } from "node:fs"

const db = new Bun.SQL("sqlite://finanza.db")
const idgen = new IdGenerator()

type Transaction = {
  id: number;
  title: string;
  amount: number;
  created_at: Date;
  type: 'income' | 'expense';
  recurrent: null | number;
  owner: string;
}

type Recurring = {
  id: number;
  interval: number;
  last: number | null;
  owner: string;
}

export const api = new Elysia({ prefix: "api" })
  .mount(auth.handler)
  .use(openapi())
  .resolve(async ({ status, request }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session || !session.user) {
      return status(401, "Unauthorized")
    }

    return { user: session.user }
  })
  
  // Api per creare una transazione
  .put('/transaction/add', async ({ user, body, status }) => {
    if (!("recurrent" in body)) {
      const transazione = await db.unsafe(
        `INSERT INTO transactions (id, title, amount, type, owner) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [idgen.nextId(), body.title, body.amount, body.type, user.id]
      );

      if (transazione.length == 0) {
        return status(404, "Not Found")
      }
      return transazione[0]
    }

    const transazione = await db.unsafe(
      `INSERT INTO transactions (id, title, amount, type, owner, recurrent) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [idgen.nextId(), body.title, body.amount, body.type, user.id, body.recurrent]
    )
    
    if (transazione.length) {
      return status(404, "Not Found")
    }
    return transazione[0]
  }, {
    body: t.Union([
      t.Object({
        title: t.String(),
        amount: t.Number(),
        type: t.Union([t.Literal('income'), t.Literal('expense')]),
        recurrent: t.Number()
      }),
      t.Object({
        title: t.String(),
        amount: t.Number(),
        type: t.Union([t.Literal('income'), t.Literal('expense')]),
      })
    ]),
    response: {
      200: t.Object({
        id: t.Number( ),
        title: t.String(),
        amount: t.Number(),
        created_at: t.Date(),
        type: t.Union([t.Literal('income'), t.Literal('expense')]),
        recurrent: t.Union([t.String(), t.Null()]),
        owner: t.String(),
      }),
      404: t.String(),
      401: t.String()
    },
    detail: {
      summary: 'Inserisci una transazione',
      description: 'inserisce una transazione che sia ricorrente o meno, e restituisce la tupla appena creata'
    }
  })
  // Lista delle transazioni
  .get('/transaction/list', async ({ user, status }) => {
    const res = await db.unsafe(
      'SELECT * FROM transactions WHERE owner = $1', [user.id]
    )

    if (res.length == 0) {
      return status(404, "Not Found")
    }

    return res
  }, {
    response: {
      200: t.Array(t.Object({
        id: t.Number( ),
        title: t.String(),
        amount: t.Number(),
        created_at: t.Date(),
        type: t.Union([t.Literal('income'), t.Literal('expense')]),
        recurrent: t.Union([t.String(), t.Null()]),
        owner: t.String(),
      })),
      404: t.String(),
      401: t.String()
    },
    detail: {
      summary: "Lista delle transazioni",
      description: "Ritorna tutte le transazioni dell'utente"
    }
  })
  // Api per creare una ricorrenza, e collegare una transazione
  .put('/recurrent/add', async ({ user, body, status }) => {
    if (!("transazione" in body)) {
      const res = await db.unsafe(
        `INSERT INTO recurring (id, interval, owner) VALUES ($1, $2, $3) RETURNING *`,
        [idgen.nextId(), body.interval, user.id]
      )

      if (res.length == 0) {
        return status(404, "Not Found")
      }

      return res[0]
    } else {
      try {
        const res = await db.transaction(async tr => {
          const ricorrenza = await tr.unsafe(
            `INSERT INTO recurring (id, interval, owner) VALUES ($1, $2, $3) RETURNING *`,
            [idgen.nextId(), body.interval, user.id]
          )

          if (ricorrenza.length == 0) {
            throw new Error("Recurrent rule non creata")
          }

          const transaction = await tr.unsafe(
            `UPDATE transactions SET recurrent = $1 WHERE id = $2 AND owner = $3 RETURNING *`,
            [ricorrenza[0].id, body.transazione, user.id]
          )

          if (transaction.length == 0) {
            throw new Error("Non esiste la transaction")
          }

          return ricorrenza[0]
        })

        return res
      } catch (e) {
        return status(404, "Not Found")
      }
    }
  }, {
    body: t.Union([
      t.Object({
        interval: t.Number(),
        transazione: t.Number()
      }),
      t.Object({
        interval: t.Number()
      })
    ]),
    response: {
      200: t.Object({
        id: t.Number(),
        interval: t.Number(),
        owner: t.String(),
      }),
      404: t.String(),
      401: t.String()
    },
    detail: {
      summary: "Inserisci una ricorrenza",
      description: "Inserisce una ricorrenza e collega una transazione se fornita"
    }
  })
  // Api per avere info del bilancio
  .get('/balance', async ({ user, status }) => {
    const res: Array<{ amount: number, type: "expense" | "income" }> = await db.unsafe(
      'SELECT sum(amount) as amount, type FROM transactions WHERE owner = $1 GROUP BY type',
      [user.id]
    )

    if (res.length == 0) {
      return status(404, "Not Found")
    }

    return {
      balance: res.map(r => r.type == "expense" ? r.amount * -1 : r.amount).reduce((acc, curr) => acc + curr, 0),
      entrate: res.find(r => r.type == "income")?.amount || 0,
      uscite: res.find(r => r.type == "expense")?.amount || 0
    }
  }, {
    response: {
      200: t.Object({
        balance: t.Number(),
        entrate: t.Number(),
        uscite: t.Number()
      }),
      404: t.String(),
      401: t.String()
    },
    detail: {
      summary: "Info veloci sul bilancio",
      description: "Ritorno un oggetto contenente il valore numerico di entrate, uscite e il bilancio"
    }
  })  