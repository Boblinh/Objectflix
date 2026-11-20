# Objectflix task board

Work on one task at a time. Mark DONE only with verification evidence.
Statuses: NOT STARTED, IN PROGRESS, BLOCKED, DONE.

| ID | Priority | Task | Status | Evidence / dependency |
| --- | --- | --- | --- | --- |
| AUD-001 | P0 | Initial read-only MVP audit | DONE | Audit in project conversation: 35 existing tests passed; 52 JavaScript syntax checks; 25 migrations applied in memory; browser and isolated security checks. Core MVP remains PARTIAL. |
| SEC-001 | P0 | Verified profile access and server-enforced ownership | IN PROGRESS | Approved. Require verified sessions for every profile operation, scope queries to the verified account, update the client, and test anonymous/cross-account/owner access. |
| SEC-002 | P0 | Remaining critical security findings | NOT STARTED | Watch-page script injection, admin fail-open authorization, browser-secret publication, and browser-only password authentication. Review one fix at a time after SEC-001. |
| MVP-001 | P0 | Playback and account-state persistence repairs | NOT STARTED | Audit found cold-cache range handling, AVC bucket selection, TV integration, and device-local persistence limitations. |
| RIGHTS-001 | P0 | Verify catalogue permissions | BLOCKED | Written permissions/licensing conditions for BFDI and Inanimate Insanity have not been verified. |

## SEC-001 acceptance

- Anonymous, invalid, expired, and revoked sessions cannot access profile routes.
- The verified server account determines ownership; supplied account identifiers cannot change it.
- Cross-account reads and writes are denied; owner create/list/edit/delete operations succeed.
- Existing Google-email and Discord-ID profile records remain addressable by their verified owners.
- The frontend sends the verified session token and shows verification/retry states instead of falling back to cached profiles.
- Record test/build evidence before marking implementation DONE. Deployment and real-provider login verification must be tracked separately.

## Known verification dependencies

- Real Google/Discord sign-in requires configured frontend client IDs, Worker OAuth secrets, and allowed callback URLs.
- Catalogue playback, physical mobile compatibility, subtitle visual fidelity, production access policies, and content permissions still need verification.
