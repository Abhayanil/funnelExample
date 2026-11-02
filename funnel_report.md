# Funnel map — Disability Path qualification

Source: https://funnel.disabilitypath.org/qualification-v30
Crawled: 2026-11-01T15:11:24.010Z

Questions: **22** · Answer options: **84** · Terminal pages: **3**

---

## 1. Are You 40 Years or Older?

*Landing headline:* Over 50 and Unemployed?

Route: `/qualification-v30`

| Answer | Goes to | Next question |
| --- | --- | --- |
| YES | `receiving_ben` (question) | Which of the following disability benefits are you currently receiving? |
| NO | `receiving_ben` (question) | Which of the following disability benefits are you currently receiving? |

## 2. Which of the following disability benefits are you currently receiving?

Route: `/qualification-v30/receiving_ben`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Social Security Disability (SSD) Benefits | `page_sm72h5` (question) | How many hours per week are you currently working? |
| Supplemental Security Income (SSI) Benefits | `page_sm72h5` (question) | How many hours per week are you currently working? |
| Both SSD and SSI Benefits | `page_sm72h5` (question) | How many hours per week are you currently working? |
| I am not receiving any disability benefits (SSD or SSI) | `page_sm72h5` (question) | How many hours per week are you currently working? |

## 3. How many hours per week are you currently working?

Route: `/qualification-v30/page_sm72h5`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Not working | `lastworked` (question) | When did you last work? |
| 20 hours or less per week | `fiveyearwork` (question) | In the past 10 years, how many years have you been employed? |
| More than 20 hours per week | `fiveyearwork` (question) | In the past 10 years, how many years have you been employed? |

## 4. When did you last work?

Route: `/qualification-v30/lastworked`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Within the last 4 months | `fiveyearwork` (question) | In the past 10 years, how many years have you been employed? |
| 4 to 7 months ago | `fiveyearwork` (question) | In the past 10 years, how many years have you been employed? |
| 7 to 12 months ago | `fiveyearwork` (question) | In the past 10 years, how many years have you been employed? |
| More than 12 months ago | `fiveyearwork` (question) | In the past 10 years, how many years have you been employed? |

## 5. In the past 10 years, how many years have you been employed?

Route: `/qualification-v30/fiveyearwork`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Less than 2 years | `page_lyensr` (question) | What is the total value of your assets? (Do not include house & car) |
| Between 2 and 4 years | `page_lyensr` (question) | What is the total value of your assets? (Do not include house & car) |
| Between 4 and 6 years | `outofwork` (question) | Do you expect to be out of work for at least a year due to a disability? |
| More than 6 years | `outofwork` (question) | Do you expect to be out of work for at least a year due to a disability? |

## 6. What is the total value of your assets? (Do not include house & car)

Route: `/qualification-v30/page_lyensr`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Less than $2000 | `outofwork` (question) | Do you expect to be out of work for at least a year due to a disability? |
| More than $2000 | `outofwork` (question) | Do you expect to be out of work for at least a year due to a disability? |
| Not Sure | `outofwork` (question) | Do you expect to be out of work for at least a year due to a disability? |

## 7. Do you expect to be out of work for at least a year due to a disability?

Route: `/qualification-v30/outofwork`

| Answer | Goes to | Next question |
| --- | --- | --- |
| YES | `visit` (question) | Are you currently seeing a doctor or taking prescribed medication for a disability? |
| NO | `visit` (question) | Are you currently seeing a doctor or taking prescribed medication for a disability? |
| YES | `conditionstart` (question) — *only when "hours per week" was answered "Not working"* | When did your condition start keeping you from working? An approximate date is fine. This is when your health started keeping you from working, not date of diagnosis. |

## 8. Are you currently seeing a doctor or taking prescribed medication for a disability?

Route: `/qualification-v30/visit`

| Answer | Goes to | Next question |
| --- | --- | --- |
| YES | `page_igxwft` (question) | Do you have a pending application for Social Security Disability (SSD) benefits? |
| NO | `page_zbkz5e` (question) | When was the last time you visited a doctor? |

## 9. Do you have a pending application for Social Security Disability (SSD) benefits?

Route: `/qualification-v30/page_igxwft`

| Answer | Goes to | Next question |
| --- | --- | --- |
| YES | `attorney` (question) | Is an attorney or advocate currently representing you for this SSD application? |
| NO | `page_1kwm6b` (question) | How do you identify your gender? |

## 10. When was the last time you visited a doctor?

Route: `/qualification-v30/page_zbkz5e`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Within last 12 months | `page_igxwft` (question) | Do you have a pending application for Social Security Disability (SSD) benefits? |
| More than 12 months ago | `page_igxwft` (question) | Do you have a pending application for Social Security Disability (SSD) benefits? |
| I haven't had one | `page_igxwft` (question) | Do you have a pending application for Social Security Disability (SSD) benefits? |

## 11. Is an attorney or advocate currently representing you for this SSD application?

Route: `/qualification-v30/attorney`

| Answer | Goes to | Next question |
| --- | --- | --- |
| YES | `attorneyfirm` (question) | Which firm is currently helping you with your disability application? |
| NO | `page_9rrpa3` (question) | Was your Disability application denied? |

## 12. How do you identify your gender?

Route: `/qualification-v30/page_1kwm6b`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Male | `page_uhs14w` (question) | Please select the option below that represents your age range |
| Female | `page_uhs14w` (question) | Please select the option below that represents your age range |
| Non - Binary | `page_uhs14w` (question) | Please select the option below that represents your age range |
| Prefer not to respond | `page_uhs14w` (question) | Please select the option below that represents your age range |

## 13. Which firm is currently helping you with your disability application?

Route: `/qualification-v30/attorneyfirm`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Trajector Disability | `page_9rrpa3` (question) | Was your Disability application denied? |
| Premier Disability | `page_9rrpa3` (question) | Was your Disability application denied? |
| Citizens Disability | `page_9rrpa3` (question) | Was your Disability application denied? |
| Nyman Turkish PC | `page_9rrpa3` (question) | Was your Disability application denied? |
| Allsup | `page_9rrpa3` (question) | Was your Disability application denied? |
| Quikaid | `page_9rrpa3` (question) | Was your Disability application denied? |
| Kirkendall Dwyer LLP | `page_9rrpa3` (question) | Was your Disability application denied? |
| Newlin Disability | `page_9rrpa3` (question) | Was your Disability application denied? |
| Other / None of the above | `page_9rrpa3` (question) | Was your Disability application denied? |

## 14. Was your Disability application denied?

Route: `/qualification-v30/page_9rrpa3`

| Answer | Goes to | Next question |
| --- | --- | --- |
| YES | `page_sozf2w` (question) | Where are you in the process? |
| NO | `page_1kwm6b` (question) | How do you identify your gender? |

## 15. Please select the option below that represents your age range

Route: `/qualification-v30/page_uhs14w`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Under 40 | `page_8w2qbu` (question) | What is your current marital status? |
| 40-49 | `page_8w2qbu` (question) | What is your current marital status? |
| 50-54 | `page_8w2qbu` (question) | What is your current marital status? |
| 55-63 | `page_8w2qbu` (question) | What is your current marital status? |
| 64 or older | `page_8w2qbu` (question) | What is your current marital status? |

## 16. Where are you in the process?

Route: `/qualification-v30/page_sozf2w`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Waiting on first decision | `page_ddujlp` (question) | How long you've been waiting ? |
| First decision was denied | `page_denialage` (question) | About how long ago did you get the denial? |
| I requested reconsideration | `page_reconstatus` (question) | What's the status of your reconsideration? |
| I requested a hearing | `page_doic6e` (question) | What's the current status of your hearing? |

## 17. What is your current marital status?

Route: `/qualification-v30/page_8w2qbu`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Single | `email` (email) | You're Pre-Qualified for Up to $4,152/Month! |
| Married | `email` (email) | You're Pre-Qualified for Up to $4,152/Month! |
| Widowed | `email` (email) | You're Pre-Qualified for Up to $4,152/Month! |
| Divorced | `email` (email) | You're Pre-Qualified for Up to $4,152/Month! |
| Separated (Not receiving support) | `email` (email) | You're Pre-Qualified for Up to $4,152/Month! |

## 18. How long you've been waiting ?

Route: `/qualification-v30/page_ddujlp`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Less than 3 Months | `page_1kwm6b` (question) | How do you identify your gender? |
| 3 – 6 Months | `page_1kwm6b` (question) | How do you identify your gender? |
| 6 – 9 Months | `page_1kwm6b` (question) | How do you identify your gender? |
| More than 9 Months | `page_1kwm6b` (question) | How do you identify your gender? |

## 19. About how long ago did you get the denial?

Route: `/qualification-v30/page_denialage`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Less than 45 days ago | `page_1kwm6b` (question) | How do you identify your gender? |
| More than 45 days ago | `page_1kwm6b` (question) | How do you identify your gender? |

## 20. What's the status of your reconsideration?

Route: `/qualification-v30/page_reconstatus`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Got denied | `page_denialage` (question) | About how long ago did you get the denial? |
| Pending | `page_ddujlp` (question) | How long you've been waiting ? |

## 21. What's the current status of your hearing?

Route: `/qualification-v30/page_doic6e`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Waiting to be scheduled | `page_ddujlp` (question) | How long you've been waiting ? |
| A hearing is scheduled | `page_6dkfid` (question) | In which month is your hearing scheduled? |
| Hearing already happened - waiting on a decision | `page_ddujlp` (question) | How long you've been waiting ? |

## 22. In which month is your hearing scheduled?

Route: `/qualification-v30/page_6dkfid`

| Answer | Goes to | Next question |
| --- | --- | --- |
| May | `page_1kwm6b` (question) | How do you identify your gender? |
| June | `page_1kwm6b` (question) | How do you identify your gender? |
| July | `page_1kwm6b` (question) | How do you identify your gender? |
| August | `page_1kwm6b` (question) | How do you identify your gender? |
| September | `page_1kwm6b` (question) | How do you identify your gender? |
| October | `page_1kwm6b` (question) | How do you identify your gender? |
| November | `page_1kwm6b` (question) | How do you identify your gender? |
| December | `page_1kwm6b` (question) | How do you identify your gender? |
| Next year (2027) | `page_1kwm6b` (question) | How do you identify your gender? |

## 23. When did your condition start keeping you from working? An approximate date is fine. This is when your health started keeping you from working, not date of diagnosis.

Route: `/qualification-v30/conditionstart`

| Answer | Goes to | Next question |
| --- | --- | --- |
| Within the last 6 months | `visit` (question) | Are you currently seeing a doctor or taking prescribed medication for a disability? |
| 6 to 12 months ago | `visit` (question) | Are you currently seeing a doctor or taking prescribed medication for a disability? |
| More than 1 year ago | `visit` (question) | Are you currently seeing a doctor or taking prescribed medication for a disability? |
| I'm not sure | `visit` (question) | Are you currently seeing a doctor or taking prescribed medication for a disability? |

## Terminal pages (no data submitted)

The post-question flow is `/email` → `/contact` → `/result`. Each page was opened directly; no email, name, or phone number was entered, so the form submissions themselves were not exercised.

### email — You're Pre-Qualified for Up to $4,152/Month!

Route: `/qualification-v30/email`

Fields: email (Your email address)

Buttons: "Send My Results", "Send My Results"


### contact — Final step: Enter your contact info to see how much you qualify for

Route: `/qualification-v30/contact`

Fields: fname (Your first name), lname (Your last name), phone (Your mobile number)

Buttons: "See What I Am Eligible For 👉"


### result — Thank You for Your Time

Route: `/qualification-v30/result`

