import { IdGenerator } from "@/lib/id-generator"
import { SQL } from "bun"
const db = new SQL("sqlite://finanza.db")
const idgen = new IdGenerator()

const TABLES = `
CREATE TABLE IF NOT EXISTS recurring (
  id BIGINT PRIMARY KEY,
  interval BIGINT NOT NULL,
  owner TEXT REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT NOT NULL CHECK(type in ('income', 'expense')),
  recurrent BIGINT DEFAULT NULL,
  owner TEXT REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (recurrent) REFERENCES recurring(id) ON DELETE SET NULL
);
`

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

await db.unsafe(TABLES)


// Transaction SQL per gestire la creazione di una recurrent in relazione a una spesa/entrata appena creata
async function newRecurringTransaction () {
  const res = await db.transaction(async (tr) => {
    const ricorrenzaId = idgen.nextId();
    const [ricorrenza] = await tr.unsafe<Recurring[]>(
      `INSERT INTO recurring (id, interval) VALUES ($1, $2) RETURNING *`,
      [ricorrenzaId, 2592000]
    );

    if (ricorrenza == undefined) throw Error("Ricorrenza non creata")

    const [spesa] = await tr.unsafe<Transaction[]>(
      `INSERT INTO transactions (id, title, amount, type, recurrent) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [idgen.nextId(), 'Ricarica very', 5, 'expense', ricorrenzaId]
    );

    return { spesa, ricorrenza };
  });

  return res
}

// Transaction SQL per gestire la creazione di una recurrent in relaziona a una spesa/entrata già creata
async function recurringTransaction(idSpesa: number) {
  const res = await db.transaction(async (tr) => {
    const ricorrenzaId = idgen.nextId();
    const [ricorrenza] = await tr.unsafe<Recurring[]>(
      `INSERT INTO recurring (id, interval) VALUES ($1, $2) RETURNING *`,
      [ricorrenzaId, 86400]
    );

    if (ricorrenza == undefined) throw Error("Ricorrenza non creata")

    const [spesa] = await tr.unsafe<Transaction[]>(
      `UPDATE transactions SET recurrent = $1 WHERE id = $2 RETURNING *`,
      [ricorrenza.id, idSpesa]
    );

    return { spesa, ricorrenza };
  });
  
  return res
}
