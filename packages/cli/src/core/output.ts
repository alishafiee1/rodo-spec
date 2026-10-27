import pc from 'picocolors';

export interface GlobalOpts {
  json?: boolean;
  project?: string[];
  lang?: string;
  verbose?: boolean;
}

/** Collects lines; `--json` prints the data object instead of the lines. */
export class Out {
  lines: string[] = [];
  constructor(public opts: GlobalOpts, private write: (s: string) => void = (s) => process.stdout.write(s)) {}
  line(s = ''): void { this.lines.push(s); }
  ok = (s: string) => this.line(`${pc.green('OK  ')} ${s}`);
  warn = (s: string) => this.line(`${pc.yellow('WARN')} ${s}`);
  fail = (s: string) => this.line(`${pc.red('FAIL')} ${s}`);
  info = (s: string) => this.line(`${pc.dim('INFO')} ${s}`);
  /** print the lines collected so far (before a prompt, so lists appear above the question); no-op with --json */
  drain(): void {
    if (this.opts.json || !this.lines.length) return;
    this.write(this.lines.join('\n') + '\n');
    this.lines = [];
  }
  /** print once at the end; `data` is the stable --json shape */
  flush(data: unknown): void {
    this.write(this.opts.json ? JSON.stringify(data, null, 2) + '\n' : this.lines.join('\n') + (this.lines.length ? '\n' : ''));
  }
}

export const mark = { err: pc.red('✖'), warn: pc.yellow('⚠') };
export const isTty = (): boolean => !!process.stdin.isTTY && !!process.stdout.isTTY;
