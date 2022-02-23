import * as core from '@actions/core';
import * as command from '@actions/core/lib/command';
import * as httpClient from '@actions/http-client';
import * as tc from '@actions/tool-cache';
import * as cp from 'child_process';
import * as path from 'path';
import SemVer from 'semver/classes/semver';
import stringArgv from 'string-argv';

import { Diagnostic, isEmptyRange, Report } from './schema';

export async function main() {
    try {
        const cwd = core.getInput('working-directory');
        if (cwd) {
            process.chdir(cwd);
        }

        const version = await getVersion();
        console.log(`pyright ${version}`);

        const { args, noComments, treatPartialAsWarning } = await getArgs(version);

        if (noComments) {
            // Comments are disabled, just run as a subprocess passing things through.
            const { status } = cp.spawnSync(process.execPath, args, {
                stdio: ['ignore', 'inherit', 'inherit'],
            });

            if (status !== 0) {
                core.setFailed(`Exit code ${status}`);
            }
            return;
        }

        var { status, stdout } = cp.spawnSync(process.execPath, args, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'inherit'],
        });

        if (!stdout.trim()) {
            // Process crashed. stderr was inherited, so just mark the step as failed.
            core.setFailed(`Exit code ${status}`);
            return;
        }

        const report = Report.parse(JSON.parse(stdout));
        var { errorCount, warningCount, informationCount } = report.summary;

        report.generalDiagnostics.forEach((diag) => {
            if (treatPartialAsWarning && diag.severity === 'error') {
                if (diag.message.includes('partially unknown')) {
                    diag.severity = 'warning';
                    errorCount -= 1;
                    warningCount += 1;
                    if (errorCount == 0) {
                        status = 0;
                    }
                }
            }

            console.log(diagnosticToString(diag, /* forCommand */ false));

            if (diag.severity === 'information') {
                return;
            }

            const line = diag.range?.start.line ?? 0;
            const col = diag.range?.start.character ?? 0;
            const message = diagnosticToString(diag, /* forCommand */ true);

            // This is technically a log line and duplicates the console.log above,
            // but we want to have the below look nice in commit comments.
            command.issueCommand(
                diag.severity,
                {
                    file: diag.file,
                    line: line + 1,
                    col: col + 1,
                },
                message
            );
        });

        console.log(
            `${errorCount} ${errorCount === 1 ? 'error' : 'errors'}, ` +
                `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}, ` +
                `${informationCount} ${informationCount === 1 ? 'info' : 'infos'} `
        );

        if (status !== 0) {
            core.setFailed(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`);
        }
    } catch (e: any) {
        core.setFailed(e.message);
    }
}

async function getVersion(): Promise<SemVer> {
    const versionSpec = core.getInput('version');
    if (versionSpec) {
        return new SemVer(versionSpec);
    }

    const client = new httpClient.HttpClient();
    const resp = await client.get('https://registry.npmjs.org/pyright/latest');
    const body = await resp.readBody();
    const obj = JSON.parse(body);
    return new SemVer(obj.version);
}

async function getArgs(version: SemVer) {
    const pyrightIndex = await getPyright(version);

    const args = [pyrightIndex];

    const noComments = getBooleanInput('no-comments', false);
    if (!noComments) {
        args.push('--outputjson');
    }

    const pythonPlatform = core.getInput('python-platform');
    if (pythonPlatform) {
        args.push('--pythonplatform');
        args.push(pythonPlatform);
    }

    const pythonVersion = core.getInput('python-version');
    if (pythonVersion) {
        args.push('--pythonversion');
        args.push(pythonVersion);
    }

    const typeshedPath = core.getInput('typeshed-path');
    if (typeshedPath) {
        args.push('--typeshed-path');
        args.push(typeshedPath);
    }

    const venvPath = core.getInput('venv-path');
    if (venvPath) {
        args.push('--venv-path');
        args.push(venvPath);
    }

    const project = core.getInput('project');
    if (project) {
        args.push('--project');
        args.push(project);
    }

    const lib = getBooleanInput('lib', false);
    if (lib) {
        args.push('--lib');
    }

    const warnings = getBooleanInput('warnings', false);
    if (warnings) {
        args.push('--warnings');
    }

    const extraArgs = core.getInput('extra-args');
    if (extraArgs) {
        args.push(...stringArgv(extraArgs));
    }

    const treatPartialAsWarning = getBooleanInput('warn-partial', false);

    return {
        args,
        noComments,
        treatPartialAsWarning
    };
}

function getBooleanInput(name: string, defaultValue: boolean): boolean {
    const input = core.getInput(name);
    if (!input) {
        return defaultValue;
    }
    return input.toUpperCase() === 'TRUE';
}

async function getPyright(version: SemVer): Promise<string> {
    // Note: this only works because the pyright package doesn't have any
    // dependencies. If this ever changes, we'll have to actually install it.
    const url = `https://registry.npmjs.org/pyright/-/pyright-${version.format()}.tgz`;
    const pyrightTarball = await tc.downloadTool(url);
    const pyright = await tc.extractTar(pyrightTarball);
    return path.join(pyright, 'package', 'index.js');
}

// Copied from pyright, with modifications.
function diagnosticToString(diag: Diagnostic, forCommand: boolean): string {
    let message = '';

    if (!forCommand) {
        if (diag.file) {
            message += `${diag.file}:`;
        }
        if (diag.range && !isEmptyRange(diag.range)) {
            message += `${diag.range.start.line + 1}:${diag.range.start.character + 1} - `;
        }
        message += diag.severity === 'information' ? 'info' : diag.severity;
        message += `: `;
    }

    message += diag.message;

    if (diag.rule) {
        message += ` (${diag.rule})`;
    }

    return message;
}
