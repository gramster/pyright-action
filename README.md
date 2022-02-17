# pyright-action

GitHub action for [pyright](https://github.com/microsoft/pyright).

```yml
- uses: jakebailey/pyright-action@v1
  with:
    version: 1.1.135 # Optional
```


## Options

```yml
inputs:
  version:
    description: 'Version of pyright to run. If not specified, the latest version will be used.'
    required: false
  working-directory:
    description: 'Directory to run pyright in. If not specified, the repo root will be used.'
    required: false
  python-platform:
    description: 'Analyze for a specific platform (Darwin, Linux, Windows).'
    required: false
  python-version:
    description: 'Analyze for a specific version (3.3, 3.4, etc.).'
    required: false
  typeshed-path:
    description: 'Use typeshed type stubs at this location.'
    required: false
  venv-path:
    description: 'Directory that contains virtual environments.'
    required: false
  project:
    description: 'Use the configuration file at this location.'
    required: false
  lib:
    description: 'Use library code to infer types when stubs are missing.'
    required: false
    default: 'false'
  extra-args:
    description: 'Extra arguments; can be used to specify specific files to check.'
    required: false
  no-comments:
    description: 'Disable issue/commit comments'
    required: false
    default: 'false'
  warn-partial:
    description: 'Treat partial unknowns as a warning, not an error.'
    required: false
    default: 'false'
```
