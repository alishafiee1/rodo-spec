import { Command } from 'commander';
import { stdinPrompter, withDrain, type Ctx, type Prompter } from './core/context';
import { CliError } from './core/errors';
import { Out, type GlobalOpts } from './core/output';
import { runLogin, runLogout, runDevices } from './commands/auth';
import { runDoctor } from './commands/doctor';
import { runInit } from './commands/init';
import { runNew } from './commands/new';
import { runResume } from './commands/resume';
import { runStatus } from './commands/status';
import { runSync } from './commands/sync';
import { runTest } from './commands/test';
import { runValidate } from './commands/validate';
import { CLI_VERSION, runVersion } from './commands/version';

const collect = (v: string, prev: string[]): string[] => [...prev, v];

export function buildProgram(run: (fn: (ctx: Ctx) => Promise<number>) => Promise<void>): Command {
  const program = new Command('rodo')
    .description('RODO method CLI')
    .version(CLI_VERSION)
    .option('--json', 'machine-readable output')
    .option('--project <slug>', 'project (repeatable; default: all)', collect, [])
    .option('--lang <fa|en>', 'language of hints and of new project files (error codes stay English)')
    .option('--verbose', 'more detail')
    .showHelpAfterError()
    .addHelpText('after', `
Getting started:
  rodo init --method-only --project <slug>   install the method kit and create rodo/<slug>/
  rodo new "Delete a note"                   start the next cycle (card, simple.md, spec.md)
  rodo validate --strict                     check the cards (exit 1 on errors)
  rodo resume <card>                         context for an AI session
  rodo test <card>                           run the card test and catch repeated failures
  rodo init --project <slug> --create-board  later: connect a board, then rodo sync`);

  program.command('init').description('install or update the method kit and create a project folder')
    .option('--name <name>', 'display name')
    .option('--server <url>', 'board server (default: RODO_SERVER, else the built-in server)')
    .option('--connect <code>', 'one-time connect code from the board website (skips the device code)')
    .option('--board <id>', 'bind to an existing board')
    .option('--create-board', 'create a new board for this project')
    .option('--method-only', 'no server: install the kit and create the project folder only')
    .option('--no-kit-update', 'skip the kit step')
    .option('--dry-run', 'print the plan, write nothing')
    .option('--yes-files', 'answer yes to the .gitignore question')
    .addHelpText('after', `
Examples:
  rodo init --method-only --project notely --lang en   kit + project folder, no server
  rodo init --project notely --create-board            log in and create a board
  rodo init --project notely --board <id>              bind to an existing board`)
    .action((o) => run((ctx) => runInit(ctx, { ...o, project: ctx.opts.project?.[0], noKitUpdate: o.kitUpdate === false })));

  program.command('login').description('log in with a device code or a connect code')
    .option('--server <url>').option('--connect <code>').option('--rotate', 'replace this device token')
    .action((o) => run((ctx) => runLogin(ctx, o)));
  program.command('logout').description('revoke this device and delete the local token').option('--server <url>')
    .action((o) => run((ctx) => runLogout(ctx, o)));
  program.command('devices').description('where to manage devices').option('--server <url>')
    .action((o) => run((ctx) => runDevices(ctx, o)));

  program.command('validate [paths...]').description('validate card files (writes nothing)')
    .option('--strict', 'exit 1 when there are errors (for CI and git hooks)')
    .action((paths: string[], o) => run((ctx) => runValidate(ctx, paths, o)));

  program.command('new <title>').description('start a new cycle: rodo/<project>/cycles/NNN-slug/ from the kit templates')
    .option('--slug <kebab-slug>', 'folder name after the number (default: from the title; needed for non-latin titles)')
    .option('--major', 'also create design.md and acceptance.feature, and set workflow: major')
    .option('--dry-run', 'print the plan, write nothing')
    .action((title: string, o) => run((ctx) => runNew(ctx, title, o)));

  program.command('sync').description('pull, merge, push and report (--offline: validate only)')
    .option('--offline').option('--dry-run').option('--pull-only').option('--push-only').option('--confirm-archive').option('--check')
    .action((o) => run((ctx) => runSync(ctx, o)));

  program.command('status').description('cards and their state').option('--local')
    .action((o) => run((ctx) => runStatus(ctx, o)));

  program.command('doctor').description('read-only health checks')
    .action(() => run((ctx) => runDoctor(ctx)));

  program.command('resume [card]').description('print the context of a card for an AI session').option('--full')
    .action((card: string | undefined, o) => run((ctx) => runResume(ctx, card, o)));

  program.command('test [card]').description('run the card test command and track failure signatures')
    .option('--adapter <adapter>', 'web|api|cli|mobile|iot|other')
    .action((card: string | undefined, o) => run((ctx) => runTest(ctx, card, o)));

  program.command('version').description('versions')
    .action(() => run((ctx) => runVersion(ctx)));

  return program;
}

export async function main(argv: string[], prompt: Prompter = stdinPrompter()): Promise<number> {
  let code = 0;
  const program = buildProgram(async (fn) => {
    const opts = program.opts<GlobalOpts>();
    const out = new Out(opts);
    const ctx: Ctx = { cwd: process.cwd(), opts, out, prompt: withDrain(prompt, out) };
    try {
      code = await fn(ctx);
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      process.stderr.write(`${e.message}\n`);
      code = e.exitCode;
    }
  });
  program.exitOverride();
  try {
    await program.parseAsync(argv);
  } catch (e) {
    const c = (e as { code?: string; exitCode?: number }).code;
    if (c === 'commander.helpDisplayed' || c === 'commander.version' || c === 'commander.help') return 0;
    return c?.startsWith('commander.') ? 2 : 1;
  }
  return code;
}

if (process.env.RODO_CLI_NO_MAIN !== '1') {
  main(process.argv).then((c) => process.exit(c), (e) => { process.stderr.write(`${(e as Error).stack ?? e}\n`); process.exit(1); });
}
