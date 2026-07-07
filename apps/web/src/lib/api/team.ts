import { apiRequest } from "./client";

export type TeamRole = "owner" | "admin" | "member" | "viewer";
export type TeamInvitationRole = Exclude<TeamRole, "owner">;

export interface TeamMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: TeamRole;
  status: string;
  joined_at: number | null;
  full_name: string;
  email: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
  can_manage_products: boolean;
  can_view_audit_log: boolean;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamInvitationRole;
  status: string;
  expires_at: number;
  created_at: number;
  invited_by_name: string | null;
}

export interface CreatedTeamInvitation extends TeamInvitation {
  invitation_id: string;
  token: string;
  resent: boolean;
  accept_url: string;
}

export interface AcceptInvitationResult {
  organization_id: string;
  member_id: string;
  role: TeamRole;
}

interface MembersResponse {
  members: TeamMember[];
}

interface InvitationsResponse {
  invitations: TeamInvitation[];
}

interface CreatedInvitationResponse {
  invitation: CreatedTeamInvitation;
}

interface UpdatedMemberResponse {
  member: TeamMember;
}

export function listTeamMembers(): Promise<TeamMember[]> {
  return apiRequest<MembersResponse>("/api/team/members").then((data) => data.members);
}

export function listTeamInvitations(): Promise<TeamInvitation[]> {
  return apiRequest<InvitationsResponse>("/api/team/invitations").then(
    (data) => data.invitations,
  );
}

export function createTeamInvitation(input: {
  email: string;
  role: TeamInvitationRole;
}): Promise<CreatedTeamInvitation> {
  return apiRequest<CreatedInvitationResponse>("/api/team/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((data) => data.invitation);
}

export function acceptTeamInvitation(token: string): Promise<AcceptInvitationResult> {
  return apiRequest<AcceptInvitationResult>("/api/team/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function revokeTeamInvitation(invitationId: string): Promise<void> {
  return apiRequest<void>(`/api/team/invitations/${encodeURIComponent(invitationId)}`, {
    method: "DELETE",
  });
}

export function updateTeamMemberRole(
  memberId: string,
  role: TeamInvitationRole,
): Promise<TeamMember> {
  return apiRequest<UpdatedMemberResponse>(
    `/api/team/members/${encodeURIComponent(memberId)}/role`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  ).then((data) => data.member);
}

export function removeTeamMember(memberId: string): Promise<void> {
  return apiRequest<void>(`/api/team/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
  });
}
