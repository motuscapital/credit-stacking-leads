# Deployment & Testing Guide

## ✅ What Was Changed

### Code Changes
1. **3 Smart Lists** instead of 1 generic list
   - 🔥 Hot Leads - Call Today
   - 🟡 Warm Leads - Call If Time
   - 🔵 Long Shots - Low Priority

2. **Time-based filtering**
   - Hot: created in last 3 days
   - Warm: created in last 7 days
   - Long Shots: older than 7 days

3. **Fixed DQ logic**
   - Typeform disqualified leads now properly tagged as `typeform-disqualified`
   - Priority set to 0 (never call)
   - Excluded from all setter lists

4. **Manual setup endpoint**
   - POST `/setup-smart-views` to create lists anytime

---

## 🚀 How to Deploy

### Option 1: Deploy to Railway (Recommended)

```bash
cd ~/credit-stacking-leads

# Push to git (if you have Railway connected to GitHub)
git push origin main

# Railway will auto-deploy
```

### Option 2: Manual Railway Deploy

```bash
# Install Railway CLI if not installed
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Deploy
railway up
```

### Option 3: Test Locally First

```bash
cd ~/credit-stacking-leads

# Start server
npm start

# Server runs on http://localhost:3001
```

---

## 🧪 Testing the Smart Lists

### Step 1: Create the Smart Views

Once deployed, trigger the setup:

```bash
curl -X POST https://your-railway-url.railway.app/setup-smart-views
```

Expected response:
```json
{
  "success": true,
  "message": "3 setter call list smart views created/updated",
  "viewCount": 3,
  "views": [
    "🔥 Hot Leads - Call Today",
    "🟡 Warm Leads - Call If Time",
    "🔵 Long Shots - Low Priority"
  ]
}
```

### Step 2: Check Close CRM

1. Log into Close CRM
2. Click "Saved Searches" or "Smart Views"
3. You should see 3 new views:
   - 🔥 Hot Leads - Call Today
   - 🟡 Warm Leads - Call If Time
   - 🔵 Long Shots - Low Priority

### Step 3: Process a Webinar

Test with a recent webinar:

```bash
# Get your webinar ID from Zoom
curl -X POST https://your-railway-url.railway.app/process-webinar/YOUR_WEBINAR_ID
```

Or process all recent webinars:

```bash
curl -X POST https://your-railway-url.railway.app/process-recent-webinars
```

### Step 4: Verify Lists Populated

Check Close CRM smart views - they should now have leads sorted by priority.

---

## 🔧 Configuration

If you want to adjust time thresholds, edit `src/close.js`:

```javascript
// Currently:
// Hot Leads: last 3 days
// Warm Leads: last 7 days
// Long Shots: older than 7 days

// To change, modify getDateDaysAgo() calls:
date_created >= "${getDateDaysAgo(3)}"  // Change 3 to any number
date_created >= "${getDateDaysAgo(7)}"  // Change 7 to any number
date_created < "${getDateDaysAgo(7)}"   // Change 7 to any number
```

---

## 📊 Monitoring

### Check if server is running

```bash
curl https://your-railway-url.railway.app/
```

Should return:
```json
{
  "status": "running",
  "message": "Credit Stacking Lead Automation",
  "endpoints": { ... }
}
```

### Check logs (Railway)

```bash
railway logs
```

---

## 🐛 Troubleshooting

### "Smart views not showing up"
- Make sure you called `/setup-smart-views` endpoint first
- Check Close CRM API key is valid in `.env`
- Check Railway logs for errors

### "Lists are empty"
- Process a webinar first: `/process-webinar/:id`
- Make sure leads meet criteria (30+ min watch time, not DQ'd, etc.)
- Check that leads were created in the right timeframe

### "Disqualified leads still showing up"
- Re-run `/setup-smart-views` to update the queries
- Old leads may have old source names - they'll update on next webinar process

---

## 🎯 Next Steps

1. **Deploy to Railway** (or test locally)
2. **Run `/setup-smart-views`** to create the 3 lists
3. **Process a recent webinar** to populate the lists
4. **Check Close CRM** - verify the 3 smart views exist and have leads
5. **Train setters** on the new workflow (see SMART-LISTS.md)
6. **Monitor conversion rates** by list to optimize thresholds

---

## 📝 Notes

- Smart views auto-update when new leads come in via webhooks
- Time-based filters update automatically (no manual action needed)
- You can manually refresh by calling `/setup-smart-views` anytime
- If you change the queries, redeploy and call `/setup-smart-views` again
