---
name: test-maintenance
description: "Review and maintain this repository's tests when implementation code changes. Prefer API flows, custom hooks, and pure-function behavior; remove or avoid brittle UI-rendering tests and update tests only when the public contract changes."
---

# Test maintenance

Use this skill when implementing, fixing, refactoring, or reviewing code that may affect tests, or when explicitly asked to inspect test impact. This is an optional maintenance workflow. It does not watch pushes, modify CI automatically, or create commits and pull requests without a separate request.

## Repository test policy

The valuable CI tests in this repository verify:

- API request flows and backend contracts through MSW, including method, URL, request data, success, error, and schema behavior.
- Custom hook behavior, including async transitions, optimistic updates, debounce or cancellation, and error recovery.
- Pure functions and domain rules, including boundary conditions and data transformations.
- A small number of end-to-end tests for critical user flows.

Do not add tests merely to prove that a component renders, that a static label or icon exists, or that a CSS class, `data-*` attribute, DOM nesting detail, or styling choice is present. Storybook and end-to-end tests own visual and critical-flow coverage when those tools are introduced or already cover the behavior.

## Workflow

### 1. Inspect the change before touching tests

Read the implementation diff, the surrounding code, existing test configuration, and the package scripts. Identify whether the change is:

- An internal refactor with the same externally observable behavior.
- A public behavior or API contract change.
- A bug fix that intentionally changes an incorrect result.
- A new branch or important domain rule without existing coverage.

Use the result of this classification to decide whether tests should be preserved, adapted, added, or removed. Do not assume that every changed file needs a test change.

### 2. Find the affected tests

Search for tests importing the changed module, using the changed hook or function, exercising the same endpoint, or asserting the changed public behavior. Also inspect test helpers, MSW handlers, fixtures, and scripts that select the tests.

Treat a test as affected when it depends on the changed contract, not merely because it renders a nearby component.

### 3. Prefer stable test boundaries

Test the smallest public boundary that proves the requirement:

- Test API behavior at the request boundary with MSW rather than asserting an implementation-specific query-cache key or internal client call.
- Test a custom hook through its returned state and effects rather than mocking React hooks or inspecting private state setters.
- Test pure functions with representative inputs, boundary values, and failure cases.
- Test user-visible behavior only when it is a meaningful user flow, not as a blanket component-rendering check.

Avoid assertions coupled to implementation details such as `location.state` object shape, private helper names, internal call order, React state setter calls, query cache internals, CSS selectors, pixel dimensions of SDK markers, or incidental DOM structure. If one of these is the actual public contract, document that reason before retaining the assertion.

### 4. Make the smallest justified test change

- Preserve expectations during an internal refactor. If the test breaks, first determine whether the test is coupled to an implementation detail.
- Change expected values only when the requirement, user-visible behavior, API contract, or intentionally corrected result changed.
- Add a test for a new API branch, important domain rule, boundary condition, async failure path, or regression that is not already covered.
- Remove a simple UI or rendering test when it provides no behavior coverage. Before removing it, confirm that the behavior is covered by an API, hook, pure-function, or end-to-end test where appropriate.
- Replace brittle tests with stable tests instead of weakening assertions until they pass.

Never delete a meaningful regression test, mark it as skipped, loosen an assertion, or rewrite the expected result only to make a failing test pass. If the implementation is wrong, fix the implementation. If the test is wrong because the contract changed, state the contract change in the report.

### 5. Verify in increasing scope

Run the smallest relevant test first, then the repository's relevant integration, unit, type-check, lint, and formatting commands. Prefer the package scripts documented in `client/package.json` and the repository documentation. Run the full relevant suite before declaring the maintenance complete.

When the local environment prevents a command from running, report the exact command and the environmental failure. Do not describe an unexecuted check as passing.

### 6. Report the reasoning

Summarize:

- Which tests were removed, retained, updated, or added.
- Why each change was needed and which public behavior it covers.
- Which commands were run and their results.
- Any remaining risk or behavior not covered by the current test layers.

Keep the report about test intent and observable contracts. Do not claim that a test is more robust without identifying the implementation dependency that was removed.

## Quick decision guide

| Situation | Action |
| --- | --- |
| Component only renders static UI | Remove or do not add a CI test; use Storybook when visual coverage is needed. |
| Internal state or library changes, same behavior | Keep the expected behavior; rewrite only assertions coupled to internals. |
| API method, URL, body, response, or error contract changes | Update the API/MSW test and its fixtures to the new contract. |
| New important function or domain rule | Add focused pure-function tests for normal and boundary cases. |
| New async hook behavior | Add or update a hook test for success, failure, cancellation, or recovery as applicable. |
| Critical end-to-end flow changes | Update the focused E2E test only when the user flow changed. |
