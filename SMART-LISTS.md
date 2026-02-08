# Setter Smart Lists - How It Works

## Overview
The system automatically creates and updates **3 prioritized smart lists** in Close CRM for your phone setters to work through.

---

## The 3 Lists

### 🔥 **List 1: Hot Leads - Call Today**

**Who's in this list:**
- ✅ Filled Typeform + QUALIFIED
- ✅ Watched 75+ mins (full webinar)
- ✅ Submitted credit report (GPT or Typeform)
- ✅ Created in last 3 days (fresh leads)
- ❌ NOT already booked
- ❌ NOT disqualified

**Sort order:** Highest priority first

**Expected conversion:** High (these are your money leads)

**Setter instructions:** Call every lead in this list first before moving on

---

### 🟡 **List 2: Warm Leads - Call If Time**

**Who's in this list:**
- ✅ Watched 30-74 mins (partial engagement)
- ✅ At least 30 mins watch time
- ✅ Created in last 7 days
- ❌ NOT already booked
- ❌ NOT disqualified
- ❌ NOT in List 1 (hot leads)

**Sort order:** Longest watch time first (e.g., 70 mins before 35 mins)

**Expected conversion:** Medium (some interest but didn't hear full pitch)

**Setter instructions:** Only call after List 1 is exhausted

---

### 🔵 **List 3: Long Shots - Low Priority**

**Who's in this list:**
- ✅ Watched 30+ mins OR filled Typeform qualified
- ✅ Older than 7 days
- ❌ NOT already booked
- ❌ NOT disqualified

**Sort order:** Priority descending, then most recent

**Expected conversion:** Low (older leads, lower intent)

**Setter instructions:** Only call if you run out of Lists 1 & 2

---

## Who Gets EXCLUDED (Never Called)

These leads will NOT appear in any setter list:

- ❌ **Disqualified on Typeform** (credit <600, low income+assets)
- ❌ **Watched <30 mins** (unless they filled Typeform)
- ❌ **No-shows** who didn't take any action
- ❌ **Already booked** (converted, removed from setter lists)

These should go into email nurture sequences instead.

---

## Lead Sources Explained

| Source | Priority | What It Means | Setter Eligible? |
|--------|----------|---------------|------------------|
| `booked` | 10 | Already converted | ❌ (removed from lists) |
| `applied-no-booking` | 9 | Filled Typeform + qualified | ✅ Hot Lead (List 1) |
| `credit-report-gpt` | 8 | Shared credit via GPT | ✅ Hot Lead (List 1) |
| `credit-report-typeform` | 8 | Shared credit via Typeform | ✅ Hot Lead (List 1) |
| `webinar-watched-full` | 5 | Watched 75+ mins | ✅ Hot Lead (List 1) |
| `webinar-watched-partial` | 3 | Watched 30-74 mins | ✅ Warm Lead (List 2) |
| `webinar-no-show` | 0 | Registered but no-show | ❌ Never call |
| `typeform-disqualified` | 0 | Failed qualification | ❌ Never call |

---

## How Setters Use This

### Daily Workflow

1. **Open Close CRM**
2. **Go to "🔥 Hot Leads - Call Today"** smart view
3. **Work through entire list** from top to bottom
4. **When List 1 is empty**, switch to "🟡 Warm Leads - Call If Time"
5. **When List 2 is empty**, switch to "🔵 Long Shots - Low Priority"

### Expected Results

- ✅ Always calling hottest leads first
- ✅ No time wasted on disqualified or cold leads
- ✅ Better conversion rates
- ✅ Clear prioritization and focus

---

## Automation

The smart lists are automatically updated:

- ✅ After each webinar is processed
- ✅ When webhooks receive new leads
- ✅ Time-based filters update daily (fresh vs old leads)

---

## Manual Setup

To create/update the smart views manually:

```bash
POST https://your-server.com/setup-smart-views
```

This will create all 3 smart views in Close CRM if they don't exist, or update them if they do.

---

## Questions?

**Q: What if a hot lead becomes old (>3 days)?**
A: It automatically moves from List 1 to List 3 (if >7 days)

**Q: What if someone books a call?**
A: They're immediately removed from all setter lists (marked as "booked")

**Q: Can we change the time thresholds?**
A: Yes! Edit the time filters in `src/close.js` - currently 3 days (hot) and 7 days (warm)

**Q: What about people who watch 25 mins?**
A: They don't qualify for any setter list unless they also fill out Typeform

**Q: Should setters skip List 3?**
A: Depends on your volume. If Lists 1 & 2 keep you busy, yes. If you need more dials, work List 3.
