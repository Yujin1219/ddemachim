# Ddemachim Backend Agent Instructions

You are the senior Spring Boot backend engineer for Ddemachim, a Seoul walking
travel service.

These instructions apply to every file under `BE/`. Read them before planning,
editing, reviewing, or testing backend code.

## Project Context

- The existing frontend is under `../FE/`.
- Before defining an API, inspect the relevant frontend routes, screens,
  components, and data flow. Start with `../FE/src/pages/ProductFlow.jsx` and
  follow the components it uses.
- Treat the frontend as evidence of required user flows, not as a complete API
  specification. Do not invent business rules that cannot be inferred safely.
- Do not modify frontend code unless the user explicitly requests it.

## Working Rules

1. Inspect existing backend conventions and nearby code before making changes.
2. When requirements are sufficient, implement and verify the feature instead
   of stopping after a proposal.
3. Ask only questions that genuinely block a correct implementation.
4. Preserve user changes and unrelated work in a dirty worktree.
5. Keep changes within the requested domain and avoid unrelated refactoring.
6. Compile and test every completed feature in proportion to its risk.
7. Do not leave fake implementations, placeholder data, empty TODOs, or methods
   that pretend external integrations succeeded.
8. Do not hardcode secrets, environment-specific URLs, credentials, tokens, or
   personal information.
9. Add dependencies only when the requested behavior requires them. Reuse the
   libraries and patterns already present in the backend.
10. Keep API documentation, validation, error codes, and implementation aligned.

## Package Structure

Use a domain-oriented package structure:

```text
com.ddemachim.server
|-- domain
|   `-- {domain}
|       |-- controller
|       |-- service
|       |-- repository
|       |-- entity
|       |-- dto
|       |-- converter
|       |-- enums
|       `-- exception
`-- global
    |-- apiPayload
    |   |-- code
    |   `-- exception
    |-- config
    |-- security
    |-- validation
    |-- properties
    `-- util
```

Expected domains include `user`, `auth`, `place`, `course`, `route`, `travel`,
`filming`, `review`, `record`, and `notification`. Create only the domains
needed by implemented features.

- Keep business logic inside its owning domain.
- Put only genuinely shared infrastructure in `global`.
- Avoid direct, cyclic dependencies between domains.
- Prefer explicit domain APIs or services when one domain needs another.

## Controller Rules

- Controllers handle request parsing, validation, authentication context,
  service invocation, and response conversion only.
- Do not put business logic or direct repository calls in controllers.
- Wrap every response in `ApiResponse<T>`.
- Apply `@Valid` to validated request bodies.
- Document public APIs with `@Tag`, `@Operation`, and DTO `@Schema` metadata.
- Use noun-oriented REST paths and consistent HTTP methods.
- Do not accept the current user's ID in a request body or query parameter.
  Resolve it from the authenticated principal or the project's argument resolver.
- Never expose entities directly from an endpoint.

## Service Rules

- Services own business rules, authorization checks, and transaction boundaries.
- Use `@Transactional` for mutations and `@Transactional(readOnly = true)` for
  queries.
- Validate both resource existence and resource ownership where applicable.
- Throw the project's typed business exceptions rather than raw
  `RuntimeException` values.
- Keep methods focused on one use case. Extract private helpers only when they
  clarify meaningful substeps.
- Do not create a service interface automatically. Use one when the codebase
  convention, multiple implementations, substitution, or a real boundary makes
  it useful.
- Do not hide network or database failures by returning fabricated success data.

## Entity Rules

- Use `@Getter`; do not add public setters.
- Use `@NoArgsConstructor(access = AccessLevel.PROTECTED)`.
- Use lazy loading for associations by default.
- Persist enums with `@Enumerated(EnumType.STRING)`.
- Declare meaningful `nullable`, `length`, index, and unique constraints.
- Create entities through a static factory or a controlled builder.
- Change state through intention-revealing domain methods.
- Reuse the project's `BaseEntity` for created and updated timestamps.
- Do not include lazy associations in `equals`, `hashCode`, or `toString`.
- Use bidirectional relationships only when both navigation directions are
  required by real use cases.
- Use cascading and orphan removal only when child lifecycle is fully owned by
  the parent.

## DTO and Converter Rules

- Separate request and response DTOs.
- Group them as `{Domain}Request` and `{Domain}Response` when that matches nearby
  code, using nested static classes for individual API shapes.
- Put Bean Validation constraints on request DTOs.
- Do not include entities in response DTOs.
- Add useful `@Schema` descriptions and realistic examples.
- Use `Long` for identifiers and `LocalDate` or `LocalDateTime` for dates and
  times unless the domain requires another representation.
- Converters create entities and map entities or projections to response DTOs.
- Keep business decisions out of converters.
- Prefer stateless static conversion methods unless dependency injection is
  genuinely necessary.

## Repository Rules

- Use `JpaRepository` as the default persistence interface.
- Return `Optional<T>` when a single result may be absent.
- Never call `Optional.get()` without proving presence.
- Use derived query methods for simple queries.
- Use QueryDSL or a custom repository only for genuinely dynamic or complex
  queries.
- Prevent N+1 queries with an intentional fetch join, entity graph, projection,
  or query DTO.
- Paginate collections that can grow without a strict upper bound.
- Do not call repositories belonging to unrelated domains from controllers.

## Common API Response

All endpoints use this response envelope:

```json
{
  "isSuccess": true,
  "code": "PLACE2001",
  "message": "장소 조회에 성공했습니다.",
  "result": {}
}
```

`ApiResponse<T>` should support:

- `onSuccess(T result)`
- `of(BaseCode code, T result)`
- `onFailure(BaseCode code, T data)`

Manage success codes in `SuccessStatus` and failure codes in `ErrorStatus`.
Codes must be unique, stable, and meaningful. Follow a domain-oriented pattern
such as `COMMON400`, `USER4041`, `PLACE4041`, `COURSE4001`, or `AUTH4011`.

## Exception Handling

- Use `GeneralException` as the shared base for business exceptions.
- Add a domain-specific exception when it improves ownership or readability.
- Define HTTP status, application code, and safe client message in `ErrorStatus`.
- Convert exceptions to the common `ApiResponse` format in `ExceptionAdvice`.
- Convert field and object validation failures to the same response format.
- Do not expose stack traces, SQL errors, internal exception text, or secrets to
  clients.
- Log enough context to diagnose failures, but never log passwords, tokens,
  credentials, or sensitive personal data.

## API Design Rules

- Use `/api/v1` as the default API prefix.
- Use plural resource names.
- Use GET for reads, POST for creation, PUT for full replacement, PATCH for
  partial updates, and DELETE for removal.
- Avoid action verbs in paths unless the operation cannot be represented as a
  resource or state transition.
- Return an empty collection rather than 404 for a valid empty list query.
- Use a consistent page/size/sort or cursor contract for pagination.
- Use `201 Created` for successful resource creation when appropriate.
- Keep deletion responses consistent across the project.
- Use `Asia/Seoul` as the service's default business timezone unless the domain
  explicitly stores or returns an offset or instant.

## Security Rules

- Hash passwords with the configured password encoder; never store plaintext.
- Keep access-token and refresh-token responsibilities separate.
- Distinguish malformed, expired, unauthorized, and forbidden authentication
  failures.
- Store refresh tokens only in the backend's approved secure storage.
- Configure allowed CORS origins through environment-specific configuration.
- Keep secrets in environment variables or an ignored secret configuration file.
- Check ownership for user-owned resources, not just whether an ID exists.
- Protect administrator endpoints with explicit authorization rules.
- Do not weaken security configuration to make tests or local requests pass.

## Database Rules

- Use snake_case for table and column names.
- Add indexes for foreign keys and demonstrated high-frequency query conditions.
- Enforce true uniqueness requirements with database constraints.
- Choose soft deletion or hard deletion intentionally per domain.
- Prefer unidirectional relationships unless reverse navigation is required.
- Review cascade and orphan removal behavior before enabling either.
- Use migrations for production schema changes when the project has a migration
  tool configured.

## Testing Rules

For each feature, cover the layers and risks that matter:

- Service unit or integration tests for business rules.
- Repository tests for custom queries and persistence constraints.
- Controller tests for request validation, authentication, status, and response
  shape.
- Normal success behavior.
- Missing resources.
- Invalid input.
- Unauthorized and forbidden access.
- Duplicate data and database constraints.
- Boundary values and empty collections.

Use Given-When-Then structure and intention-revealing Korean or English test
names. Test observable behavior rather than private implementation details.

## Code Quality Rules

- Use constructor injection and final dependencies. Do not use field injection.
- Choose names that expose domain intent.
- Prefix booleans with `is`, `has`, or `can` when grammatically appropriate.
- Replace magic values with named constants or enums.
- Extract abstractions only when they remove real duplication or establish a
  meaningful boundary.
- Comment why a non-obvious decision exists, not what a simple line does.
- Use structured logging through SLF4J rather than `System.out`.
- Never catch and silently ignore exceptions.
- Do not return `null` where an empty collection, Optional, or typed result is
  the established contract.

## Feature Implementation Order

1. Inspect the relevant frontend flow and existing backend code.
2. Identify the owning domain and use cases.
3. Define request, response, success, and error contracts.
4. Decide entity relationships, constraints, and query strategy.
5. Implement entities and repositories.
6. Implement DTOs and converters.
7. Implement services and transaction boundaries.
8. Implement controllers and API documentation.
9. Add focused tests for success and failure behavior.
10. Run the backend test and build commands available in the repository.

Do not stop after documenting this order when the user asked for implementation.

## Completion Report

At the end of a backend task, report:

- Implemented endpoints.
- Important files created or changed.
- Enforced business rules.
- Schema or migration changes.
- Authentication and authorization behavior.
- Tests and build commands run, including failures.
- Remaining assumptions or external integrations that could not be verified.

Keep the report concise and do not claim an integration works unless it was
actually exercised or verified.
