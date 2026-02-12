# TMT Data Protection Policy

## 1. Framework
This policy follows the ICRC Humanitarian Data Protection Handbook as the primary compliance framework, with additional consideration for Palestinian Public Health Law No. 20.

## 2. Data Classification

| Category | Examples | Encryption | Access |
|---|---|---|---|
| Public | Hospital locations, status | None required | Any authenticated user |
| Internal | Alert data, analytics | TLS in transit | Hospital staff |
| Confidential | Patient names, locations | AES-256 at rest + TLS | Authorized medical personnel |
| Restricted | Medical records, conditions | AES-256 at rest + TLS | Doctor with patient consent |

## 3. Encryption Standards
- **At rest**: AES-256-CBC for medical records stored in PostgreSQL
- **In transit**: TLS 1.3 for all API communication
- **SMS payloads**: AES-128-GCM with per-patient derived keys (HKDF)
- **Key management**: Master key stored in environment variables, never in database. Patient-specific keys derived via HKDF(master_key, patient_id)

## 4. Access Control
- **Role-based access control (RBAC)** with three roles: patient, doctor, hospital_admin
- Patients can only access their own data
- Doctors can access patient records within their hospital's coverage area
- Hospital admins can manage hospital status and view all data in coverage area

## 5. Audit Logging
Every access to patient data is logged with:
- User ID of accessor
- Action performed (read, create, update, delete)
- Resource accessed
- Timestamp
- IP address
- User agent

Audit logs are immutable and retained for minimum 7 years.

## 6. Data Retention
- Active patient records: Retained while patient account is active
- Inactive patient records: Deleted 2 years after last activity
- Alert data: Retained for 5 years for analysis
- Audit logs: Retained for 7 years
- SMS logs: Retained for 1 year, then anonymized
- Telegram intelligence: Retained for 1 year in vector database

## 7. Breach Notification
In the event of a data breach:
1. Identify and contain the breach within 1 hour
2. Assess the scope and impact within 24 hours
3. Notify affected individuals within 72 hours
4. Notify relevant authorities within 72 hours
5. Document the breach, response, and remediation

## 8. Patient Rights
- **Access**: Patients can view all their data
- **Rectification**: Patients can correct inaccurate data
- **Erasure**: Patients can request deletion (right to be forgotten)
- **Withdrawal**: Patients can withdraw consent at any time
- **Portability**: Patients can export their data

## 9. SMS Data Protection
- Inbound SMS SOS payloads are encrypted with AES-128-GCM
- Outbound SMS to hospitals contains only minimum necessary information: name, location, condition summary, phone number
- Full medical records are NEVER sent via SMS
- SMS logs do not store decrypted payload content

## 10. Third-Party Data Sharing
- Hospital partners require signed Data Sharing Agreements
- Telegram data is from public channels only
- No patient data is shared with third parties without explicit consent
