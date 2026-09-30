/**
 * SEC filings. A Filing is metadata about one EDGAR submission. Its content becomes
 * Evidence (passages, XBRL facts) and FinancialFacts (normalized values).
 *
 * Dates: EDGAR assigns a filing date (civil date, US Eastern) and an acceptance
 * date-time. We store the filing date as a CalendarDate and acceptance as a UTC
 * Timestamp; "when did the market know" questions use `acceptedAt`.
 */
import { z } from "zod";
import { CalendarDate, FilingId, IssuerId, Timestamp } from "./primitives.js";
import { FinancialPeriod } from "./periods.js";

/** V0 forms. Amendments are separate form types on EDGAR ("10-K/A"). Anything else is "other" with the raw form kept. */
export const FormType = z.enum(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "20-F", "40-F", "6-K", "DEF 14A", "S-1", "4", "other"]);
export type FormType = z.infer<typeof FormType>;

export const AMENDMENT_FORMS: ReadonlySet<FormType> = new Set(["10-K/A", "10-Q/A", "8-K/A"]);

export const Filing = z
  .object({
    id: FilingId,
    issuerId: IssuerId,
    /** EDGAR accession number, "0000320193-24-000123". Globally unique; our natural key. */
    accessionNumber: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
    formType: FormType,
    /** Form exactly as EDGAR lists it; required when formType is "other". */
    rawFormType: z.string().min(1),
    filedOn: CalendarDate,
    acceptedAt: Timestamp,
    /** "Period of report" from the filing header: the balance-sheet date for 10-K/10-Q, event date for 8-K. */
    periodOfReport: CalendarDate.optional(),
    /** Primary fiscal period the filing reports (FY for 10-K, the quarter for 10-Q). */
    reportedPeriod: FinancialPeriod.optional(),
    primaryDocumentUrl: z.string().url(),
    /** For amendments: the accession number of the filing this amends, when determinable. */
    amendsAccessionNumber: z.string().regex(/^\d{10}-\d{2}-\d{6}$/).optional(),
    /** 8-K item numbers, e.g. ["2.02", "9.01"]. */
    items: z.array(z.string().regex(/^\d+\.\d{2}$/)).default([]),
    hasXbrl: z.boolean(),
    retrievedAt: Timestamp,
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.formType !== "other" && f.rawFormType !== f.formType) {
      ctx.addIssue({ code: "custom", path: ["rawFormType"], message: "rawFormType must equal formType unless formType is other" });
    }
    if (f.amendsAccessionNumber && !AMENDMENT_FORMS.has(f.formType) && f.formType !== "other") {
      ctx.addIssue({ code: "custom", path: ["amendsAccessionNumber"], message: "only amendment forms may amend another filing" });
    }
  });
export type Filing = z.infer<typeof Filing>;
