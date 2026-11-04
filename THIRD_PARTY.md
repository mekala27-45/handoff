# Third-party notices

Original application code is MIT licensed. Original synthetic fixtures have a separate CC0 dedication. These do not change third-party licenses.

| Package | Pinned version | Declared license |
| --- | --- | --- |
| eve | 1.0.0-rc.1 | Apache-2.0 |
| pg | 8.23.1 | MIT |
| zod | 4.6.7 | MIT |
| vite | 8.3.5 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| @types/node | 26.6.6 | MIT |
| @types/pg | 8.23.1 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| @ai-sdk/openai-compatible | 3.0.82 | Apache-2.0 |
| @fontsource/zilla-slab | 5.3.0 | OFL-1.1 |
| @fontsource/asap | 5.3.0 | OFL-1.1 |
| @fontsource/ubuntu-sans-mono | 5.3.0 | UFL-1.0 |
| ai | 7.0.159 | Apache-2.0 |

Qwen3:0.6b is a separate Apache-2.0 model artifact. Its registry digest and license text are preserved in docs/sources/model-lock.json. The portable Ollama release is pinned in docs/sources/ollama-release.json. Weights and executables are excluded from the repository.

Agents v4 and v5 evaluate `qwen3:4b-q4_K_M`, also under Apache-2.0. Its official registry manifest bytes and full digest are preserved in [model-lock-v4.json](docs/sources/model-lock-v4.json). Downloaded license, model size and quantization metadata are recorded in the [original CPU preflight](reports/model-experiments/41671605565/reports/checks/model-preflight-v4.json). The Linux Ollama release is pinned in [ollama-linux-release.json](docs/sources/ollama-linux-release.json).

Zilla Slab, Asap and Ubuntu Sans Mono are self-hosted through their pinned Fontsource packages. Full notices are included under apps/site/public/licenses. No Google Fonts network request is needed.

Dependency integrity values and original source URLs are in docs/sources/dependency-lock.json. Transitive package notices remain in their installed distributions. CI action versions and container image digests are locked under docs/sources.
