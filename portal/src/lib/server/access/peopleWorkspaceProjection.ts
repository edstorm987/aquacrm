import "server-only";

import type { AccessPerson } from "@/components/access/accessModel";
import type { PeopleCommissionRule, PeopleEmployee, PeopleOnboardingItem } from "@/server/types";
import type { StaffCapacitySnapshot } from "@/server/staffCapacity";
import { peopleSnapshot } from "@/server/people";
import {
  redactPeopleEmployeePay,
  workspaceElementLevel,
  type WorkspaceElementAccess,
} from "@/lib/server/access/workspaceElementAccess";

type Snapshot = ReturnType<typeof peopleSnapshot>;

export interface StaffOverviewElementDto {
  activePeople: number;
  portalAccounts: number;
  candidatesLive: number;
  candidatesUnderReview: number;
  onboardingOpen: number;
  pendingLeave: number;
  applicationStages: Record<string, number>;
  employeeOfMonth: { name: string; note?: string } | null;
}

export interface StaffPersonRef {
  id: string;
  name: string;
}

export interface StaffTrainingPersonDto extends StaffPersonRef {
  onboardingItems: PeopleOnboardingItem[];
}

export interface StaffPayPersonDto extends StaffPersonRef {
  payBasis: PeopleEmployee["payBasis"];
  basePayMinor?: number;
  currency: string;
  commissionRules: PeopleCommissionRule[];
}

export interface StaffPeopleElementDto {
  applications: Snapshot["applications"];
  directory: Snapshot["directory"];
  cards: Snapshot["cards"];
  delegatable: Snapshot["delegatable"];
  orgChart: Snapshot["orgChart"];
  hiringStages: Snapshot["processConfig"]["hiringStages"];
  contracts: Snapshot["contracts"];
  contractTemplates: Snapshot["contractTemplates"];
}

export interface StaffScheduleElementDto {
  people: StaffPersonRef[];
  leaveRequests: Snapshot["leaveRequests"];
  shifts: Snapshot["shifts"];
}

export interface StaffTrainingElementDto {
  people: StaffTrainingPersonDto[];
  assignments: Snapshot["training"];
  onboardingTemplate: Snapshot["processConfig"]["onboardingSteps"];
  modules: Snapshot["trainingModules"];
}

export interface StaffPayElementDto {
  people: StaffPayPersonDto[];
}

export interface StaffAccessElementDto {
  people: AccessPerson[];
}

export interface PeopleWorkspaceProjection {
  overview: StaffOverviewElementDto | null;
  capacity: StaffCapacitySnapshot | null;
  people: StaffPeopleElementDto | null;
  schedule: StaffScheduleElementDto | null;
  training: StaffTrainingElementDto | null;
  pay: StaffPayElementDto | null;
  access: StaffAccessElementDto | null;
}

function visible(access: WorkspaceElementAccess, key: Parameters<typeof workspaceElementLevel>[1]): boolean {
  return workspaceElementLevel(access, key) !== "hidden";
}

function withoutSchedule<T extends PeopleEmployee>(employee: T): T {
  const projected = { ...employee } as T;
  const record = projected as unknown as Record<string, unknown>;
  delete record.weeklyHours;
  delete record.holidayAllowanceDays;
  return projected;
}

function projectCard(
  card: Snapshot["cards"][number],
  options: { pay: boolean; schedule: boolean; training: boolean },
): Snapshot["cards"][number] {
  let employee = card.employee ? { ...card.employee } : null;
  if (employee && !options.pay) employee = redactPeopleEmployeePay(employee);
  if (employee && !options.schedule) employee = withoutSchedule(employee);
  if (employee && !options.training) employee = { ...employee, onboardingItems: [] };
  return {
    ...card,
    employee,
    leaveRequests: options.schedule ? card.leaveRequests : [],
    shifts: options.schedule ? card.shifts : [],
    holiday: options.schedule ? card.holiday : { allowanceDays: 0, usedDays: 0, remainingDays: 0 },
    training: options.training ? card.training : [],
    freelancerJobs: options.pay ? card.freelancerJobs : [],
  };
}

/**
 * Build independent DTOs for each governed Staff element. A visible Schedule,
 * Training, Pay or Access tab receives only the person fields it needs; it
 * never causes the full People directory, cards or organisation graph to cross
 * the RSC/API boundary. Capacity currently belongs to the Staff People element;
 * the caller supplies it only when that owning element is visible, so the
 * expensive Radar projection is also absent when hidden.
 */
export function projectPeopleWorkspaceSnapshot(
  snapshot: Snapshot,
  access: WorkspaceElementAccess,
  capacity: StaffCapacitySnapshot | null = null,
): PeopleWorkspaceProjection {
  const overviewVisible = visible(access, "staff.overview");
  const peopleVisible = visible(access, "staff.people");
  const scheduleVisible = visible(access, "staff.schedule");
  const trainingVisible = visible(access, "staff.training");
  const payVisible = visible(access, "staff.pay");
  const accessVisible = visible(access, "workspace.settings");
  const activeEmployees = snapshot.employees.filter(employee => employee.status !== "alumni");
  const openApplications = snapshot.applications.filter(application => !["declined", "withdrawn", "onboarding"].includes(application.stage));
  const stageCounts = Object.fromEntries(snapshot.applications.map(application => application.stage)
    .map(stage => [stage, snapshot.applications.filter(application => application.stage === stage).length]));

  return {
    overview: overviewVisible ? {
      activePeople: activeEmployees.length,
      portalAccounts: activeEmployees.filter(employee => Boolean(employee.userId)).length,
      candidatesLive: openApplications.length,
      candidatesUnderReview: snapshot.applications.filter(application => application.stage === "under-review").length,
      onboardingOpen: snapshot.employees.reduce((sum, employee) => sum + employee.onboardingItems.filter(item => item.status !== "done").length, 0),
      pendingLeave: snapshot.leaveRequests.filter(request => request.status === "pending").length,
      applicationStages: stageCounts,
      employeeOfMonth: peopleVisible && snapshot.employeeOfMonth ? {
        name: snapshot.employeeOfMonth.entry?.name ?? "A team member",
        note: snapshot.employeeOfMonth.recognition.note,
      } : null,
    } : null,
    capacity: peopleVisible ? capacity : null,
    people: peopleVisible ? {
      applications: snapshot.applications,
      directory: snapshot.directory,
      cards: snapshot.cards.map(card => projectCard(card, {
        pay: payVisible,
        schedule: scheduleVisible,
        training: trainingVisible,
      })),
      delegatable: snapshot.delegatable,
      orgChart: snapshot.orgChart,
      hiringStages: snapshot.processConfig.hiringStages,
      contracts: snapshot.contracts,
      contractTemplates: snapshot.contractTemplates,
    } : null,
    schedule: scheduleVisible ? {
      people: snapshot.employees.map(({ id, name }) => ({ id, name })),
      leaveRequests: snapshot.leaveRequests,
      shifts: snapshot.shifts,
    } : null,
    training: trainingVisible ? {
      people: snapshot.employees.map(({ id, name, onboardingItems }) => ({ id, name, onboardingItems })),
      assignments: snapshot.training,
      onboardingTemplate: snapshot.processConfig.onboardingSteps,
      modules: snapshot.trainingModules,
    } : null,
    pay: payVisible ? {
      people: snapshot.employees.map(({ id, name, payBasis, basePayMinor, currency, commissionRules }) => ({
        id,
        name,
        payBasis,
        basePayMinor,
        currency,
        commissionRules,
      })),
    } : null,
    access: accessVisible ? {
      people: snapshot.employees.flatMap(employee => employee.userId ? [{
        id: employee.userId,
        name: employee.name,
        email: employee.email,
        detail: employee.title,
      }] : []),
    } : null,
  };
}
