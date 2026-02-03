# Troubleshooting Login Issues

## Issue: Frontend Not Accepting Admin Credentials

### Step 1: Check if Admin User Exists

```bash
cd backend
source venv/bin/activate
python scripts/check_admin_user.py
```

This will show:
- ✅ If admin user exists
- ✅ If password is correct
- ❌ If user doesn't exist (need to create it)

### Step 2: Create Admin User (if needed)

```bash
cd backend
source venv/bin/activate
python scripts/create_admin_user.py
```

**Default Credentials:**
- Email: `admin@bria.com`
- Password: `admin123`

### Step 3: Verify Database Connection

Make sure PostgreSQL is running and the database exists:

```bash
# Check PostgreSQL
brew services list | grep postgresql

# Check database
psql -U $(whoami) -d bria -c "SELECT email, username FROM users WHERE email = 'admin@bria.com';"
```

### Step 4: Check API Gateway

Make sure the API Gateway is running:

```bash
curl http://localhost:8000/api/v1/health
```

### Step 5: Test Login via API

```bash
curl -X POST http://localhost:8000/api/v1/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@bria.com&password=admin123"
```

If this works, the issue is in the frontend. If it doesn't, check:
- Database connection
- User exists in database
- Password is correct

## Issue: Frontend Not Showing Errors

### Fixed Issues:

1. ✅ Error messages now properly extracted from API responses
2. ✅ Handles different error formats (string, array, object)
3. ✅ Shows connection errors clearly
4. ✅ Alert components properly display error text

### If Errors Still Don't Show:

1. **Check Browser Console** - Open DevTools (F12) and check for JavaScript errors
2. **Check Network Tab** - See what the API is actually returning
3. **Check API Response** - The error should be in `response.data.detail`

### Common Error Formats:

- **String**: `"Incorrect email or password"`
- **Array**: `[{"type": "value_error", "msg": "field required"}]`
- **Object**: `{"message": "Database not available"}`

All formats are now handled correctly.

## Debug Steps

1. **Check if user exists:**
   ```bash
   python backend/scripts/check_admin_user.py
   ```

2. **Create user if missing:**
   ```bash
   python backend/scripts/create_admin_user.py
   ```

3. **Test API directly:**
   ```bash
   curl -X POST http://localhost:8000/api/v1/auth/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin@bria.com&password=admin123"
   ```

4. **Check frontend console:**
   - Open browser DevTools (F12)
   - Check Console tab for errors
   - Check Network tab for API calls

5. **Verify services are running:**
   ```bash
   ./check_services.sh
   ```

## Still Having Issues?

1. Make sure all services are running: `./check_services.sh`
2. Check database is accessible
3. Verify admin user exists: `python backend/scripts/check_admin_user.py`
4. Test API directly (see above)
5. Check browser console for JavaScript errors

