'use client';
// Staff sign the current policy inside the boxes the admin placed (same boxes and drawing as sign requests).
import SignPanel from '@/app/sign/SignPanel';
import { signPolicy } from '@/app/policies/signActions';

export default function PolicySign({ policyId, versionId, fileUrl, fields, defaultName }) {
  const submit = (payload) => signPolicy({ policy_id: policyId, version_id: versionId, agree: true, ...payload });
  return <SignPanel fileUrl={fileUrl} fields={fields} slot="staff" defaultName={defaultName} submit={submit} />;
}
