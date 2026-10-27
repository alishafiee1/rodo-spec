import { createInterface } from 'node:readline';
import { Out, isTty, type GlobalOpts } from './output';

export interface Prompter {
  interactive: boolean;
  ask(question: string, def?: string): Promise<string>;
  /** `def` true: Enter = yes, shown as (Y/n). Without a default the user must type yes. */
  confirm(question: string, def?: boolean): Promise<boolean>;
}

export interface Ctx {
  cwd: string;
  opts: GlobalOpts;
  out: Out;
  prompt: Prompter;
  /** test hook: the wait between device-code polls */
  sleep?: (ms: number) => Promise<void>;
}

/** Reads answers line by line from stdin, so piped input works too. EOF = empty answer. */
export function stdinPrompter(): Prompter {
  let it: AsyncIterator<string> | null = null;
  const next = async (): Promise<string> => {
    it ??= createInterface({ input: process.stdin })[Symbol.asyncIterator]();
    const r = await it.next();
    return r.done ? '' : r.value;
  };
  return {
    interactive: isTty(),
    async ask(q, def) {
      process.stderr.write(`${q}${def ? ` [${def}]` : ''}: `);
      const a = (await next()).trim();
      return a || def || '';
    },
    async confirm(q, def) {
      process.stderr.write(def ? `${q} (Y/n): ` : `${q} (type yes): `);
      const a = (await next()).trim().toLowerCase();
      if (def && a === '') return true;
      return a === 'yes' || (def === true && (a === 'y'));
    },
  };
}

/** Prompts print the lines collected so far first, so a list shows above its "Number" question (dogfood P1-4). */
export function withDrain(p: Prompter, out: Out): Prompter {
  return {
    interactive: p.interactive,
    ask: (q, d) => { out.drain(); return p.ask(q, d); },
    confirm: (q, d) => { out.drain(); return p.confirm(q, d); },
  };
}

/** For tests: answers come from a fixed list. */
export function scriptedPrompter(answers: string[], interactive = false): Prompter {
  const a = [...answers];
  return {
    interactive,
    ask: async (_q, def) => a.shift() || def || '',
    confirm: async (_q, def) => {
      const x = (a.shift() ?? '').toLowerCase();
      return x === 'yes' || (def === true && (x === '' || x === 'y'));
    },
  };
}
