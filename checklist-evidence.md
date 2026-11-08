# Appendix A implementation mapping

Every card also supports since/until, links, notes and correction history. All details are optional. Automated evidence is in src/core/checklist.test.ts; production browser/device grading remains a separate check.

| Item | Area / kind | Structured details |
|---|---|---|
| 1 | about / Full name (also Former name) | type, since |
| 2 | about / Birthday | place |
| 3 | about / Citizenship | how |
| 4 | about / Identity document | type number issuer issued expires |
| 5 | about / Language | level |
| 6 | health / Emergency contact | relationship phone |
| 7 | health / Condition | treatedBy |
| 8 | health / Medication | dose often status |
| 9 | health / Allergy | reaction severity |
| 10 | health / Immunization | dose |
| 11 | health / Doctor | specialty phone |
| 12 | health / Health insurance | insurer plan member |
| 13 | health / Procedure or hospital stay | what where date |
| 14 | health / Measurement | type amount unit date |
| 15 | health / Care wishes | type wish document |
| 16 | health / Family health history | condition |
| 17 | work / Job | employer title |
| 18 | work / Education | school degree field |
| 19 | work / Certification | issuer number expires |
| 20 | work / Military service | branch rank |
| 21 | work / Volunteering | organization role |
| 22 | work / Skill | level |
| 23 | money / Bank account | bank type account |
| 24 | money / Retirement account | provider type account |
| 25 | money / Loan or debt | lender type amount |
| 26 | money / Credit card | issuer number |
| 27 | money / Insurance policy | insurer type account |
| 28 | money / Income | source amount |
| 29 | money / Tax record | year preparer document |
| 30 | home / Address | street tenure |
| 31 | home / Vehicle | year make model vin plate |
| 32 | home / Possession | description acquired |
| 33 | home / Utility | provider account |
| 34 | home / Pet | species birthday |
| 35 | people / Partner | relationship |
| 36 | people / Child | birthday |
| 37 | people / Family member | relationship |
| 38 | people / Family member | relationship |
| 39 | people / Friend | met |
| 40 | people / Important date | type date |
| 41 | people / Friend | phone email address |
| 42 | interests / Book | author read rating |
| 43 | interests / Movie or show | watched rating |
| 44 | interests / Music | artist |
| 45 | interests / Hobby | often |
| 46 | interests / Place visited | with |
| 47 | goals / Goal | by status |
| 48 | goals / Milestone | date |
| 49 | goals / Wishes for after death | funeral bequests will |
| 50 | goals / Value | why |
