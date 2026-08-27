import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addBusinessCalendarDays,
  BUSINESS_TIME_ZONE,
  businessCalendarDate,
  businessCalendarMonth,
  dateInputValue,
} from "../src/lib/shared/formatDateTime";

test("business dates use the declared London calendar rather than UTC or browser local time", () => {
  const summerMidnight = Date.parse("2026-08-24T23:30:00.000Z");
  assert.equal(BUSINESS_TIME_ZONE, "Europe/London");
  assert.equal(businessCalendarDate(summerMidnight), "2026-08-25");
  assert.equal(businessCalendarMonth(Date.parse("2026-08-31T23:30:00.000Z")), "2026-09");
  assert.equal(businessCalendarDate(summerMidnight, "America/Los_Angeles"), "2026-08-24");
  assert.equal(businessCalendarDate(summerMidnight, "Asia/Tokyo"), "2026-08-25");
});

test("both UK DST boundaries retain the intended local day", () => {
  assert.equal(businessCalendarDate(Date.parse("2026-03-29T00:30:00.000Z")), "2026-03-29");
  assert.equal(businessCalendarDate(Date.parse("2026-03-29T23:30:00.000Z")), "2026-03-30");
  assert.equal(businessCalendarDate(Date.parse("2026-10-25T00:30:00.000Z")), "2026-10-25");
  assert.equal(businessCalendarDate(Date.parse("2026-10-25T01:30:00.000Z")), "2026-10-25");
});

test("payment terms add calendar days instead of fixed 24-hour durations", () => {
  assert.equal(addBusinessCalendarDays(1, Date.parse("2026-03-28T23:30:00.000Z")), "2026-03-29");
  assert.equal(addBusinessCalendarDays(1, Date.parse("2026-10-24T23:30:00.000Z")), "2026-10-26");
  assert.equal(addBusinessCalendarDays(14, "2026-03-20"), "2026-04-03");
  assert.equal(addBusinessCalendarDays(-1, "2027-01-01"), "2026-12-31");
  assert.equal(addBusinessCalendarDays(0.5, "2026-01-01"), "");
});

test("date-only save, reload and export values remain lossless", () => {
  for (const date of ["2026-03-29", "2026-08-25", "2026-10-25"]) {
    assert.equal(dateInputValue(date), date);
    assert.equal(dateInputValue(Date.parse(date)), date);
  }
  assert.equal(dateInputValue("2026-02-30"), "");
  assert.equal(dateInputValue("not-a-date"), "");
});

test("mounted record defaults use the calendar contract while UTC export stamps stay explicit", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const newClient = read("src/app/portal/agency/_NewClientButton.tsx");
  const people = read("src/app/portal/agency/people/_PeopleCommand.tsx");
  const clientFinance = read("src/app/portal/clients/[clientId]/_FinanceTabClient.tsx");
  const newStaff = read("src/built-ins/modules/agency-hr/src/components/NewStaffModal.tsx");
  const employeeList = read("src/built-ins/modules/agency-hr/src/components/EmployeeListClient.tsx");
  const invoices = read("src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx");
  const income = read("src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx");
  const expenses = read("src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx");
  const paymentPlans = read("src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx");
  const commercialPack = read("src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx");
  const commercialPlans = read("src/built-ins/modules/agency-finance/src/components/CommercialPlansManager.tsx");
  const leadsHandlers = read("src/built-ins/modules/leads-pipeline/src/api/handlers.ts");

  for (const source of [newClient, people, clientFinance, newStaff, employeeList]) {
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/);
  }
  assert.match(newClient, /onboardingStartedAt: businessCalendarDate\(\)/);
  assert.match(people, /const todayIso = businessCalendarDate\(\)/);
  assert.match(people, /const period = businessCalendarMonth\(\)/);
  assert.match(clientFinance, /return addBusinessCalendarDays\(14\)/);
  assert.match(newStaff, /defaultValue=\{businessCalendarDate\(\)\}/);
  assert.match(employeeList, /joinedAt: businessCalendarDate\(\)/);
  assert.match(invoices, /defaultValue=\{addBusinessCalendarDays\(defaultPaymentTermsDays\)\}/);
  assert.match(income, /defaultValue=\{businessCalendarDate\(\)\}/);
  assert.doesNotMatch(expenses, /function toDateInputValue/);
  assert.match(paymentPlans, /return addBusinessCalendarDays\(14\)/);
  assert.match(commercialPack, /addBusinessCalendarDays\(product\.paymentTermsDays \?\? 7\)/);
  assert.match(commercialPlans, /return addBusinessCalendarDays\(7\)/);
  assert.equal((leadsHandlers.match(/onboardingStartedAt: businessCalendarDate\(\)/g) ?? []).length, 2);

  // Filenames are UTC event/export stamps, not persisted business dates.
  assert.match(invoices, /invoices-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.csv/);
  assert.match(income, /\$\{name\}-\$\{new Date\(\)\.toISOString\(\)\.slice\(0,10\)\}\.csv/);
});
