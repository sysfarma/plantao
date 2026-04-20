# Security Specification - Financial Data Isolation

## Data Invariants
1. **Subscription Invariant**: A user can only see subscription details of a pharmacy they own.
2. **Payment Invariant**: A user can only see payment history of a pharmacy they own.
3. **Payment Integrity**: A user can only initiate a payment for a pharmacy they own.
4. **Admin Override**: System administrators have unrestricted read/write access to all financial records for audit and support purposes.

## The "Dirty Dozen" Payloads (Unauthorized Access Attempts)

| ID | Operation | Collection | Payload / Context | Expected Result | Reason |
|:---|:---|:---|:---|:---|:---|
| P01 | read (get) | `payments` | Authenticated User A tries to read User B's payment | PERMISSION_DENIED | Violation of Ownership |
| P02 | read (list) | `payments` | Authenticated User A tries to list all payments | PERMISSION_DENIED | Query must be filtered by owner |
| P03 | create | `payments` | Authenticated User A tries to create payment for Pharmacy B | PERMISSION_DENIED | Identity Spoofing |
| P04 | read (get) | `subscriptions` | Authenticated User A tries to read User B's subscription | PERMISSION_DENIED | Violation of Ownership |
| P05 | read (list) | `subscriptions` | Authenticated User A tries to list all subscriptions | PERMISSION_DENIED | Privacy Leak |
| P06 | update | `payments` | Authenticated Pharmacy Owner tries to update payment status | PERMISSION_DENIED | Only Admin can change status |
| P07 | delete | `payments` | Authenticated Pharmacy Owner tries to delete payment history | PERMISSION_DENIED | Immutability |
| P08 | update | `subscriptions` | Authenticated Pharmacy Owner tries to extend expiry | PERMISSION_DENIED | State Shortcutting |
| P09 | create | `payments` | Anonymous user tries to create payment | PERMISSION_DENIED | Missing Authentication |
| P10 | create | `payments` | Admin tries to create payment for non-existent pharmacy | PERMISSION_DENIED | Relational Integrity (Parent must exist) |
| P11 | read (get) | `users` | Authenticated User A tries to read User B's PII | PERMISSION_DENIED | PII Isolation |
| P12 | update | `users` | Authenticated User A tries to promote themselves to 'admin' | PERMISSION_DENIED | Privilege Escalation |

## Red Team Audit Results

| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning | Status |
|:---|:---|:---|:---|:---|
| `payments` | Blocked (isPharmacyOwner) | Blocked (Admin only update) | Blocked (Payload size limits) | ✅ SECURE |
| `subscriptions` | Blocked (isPharmacyOwner) | Blocked (Admin only update) | Blocked (Schema validation) | ✅ SECURE |

---
**Note:** The rules implemented below will enforce these constraints synchronously.
