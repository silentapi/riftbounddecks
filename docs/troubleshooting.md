# Troubleshooting Guide

## Common Issues

### ERR_EMPTY_RESPONSE or Failed to Fetch

**Symptoms:**
- Frontend shows "Unable to connect to server" error
- Network tab shows `ERR_EMPTY_RESPONSE` or `Failed to fetch`

**Causes:**
1. Backend server is not running
2. Backend server crashed during startup
3. MongoDB connection failed
4. Port conflict (another service using port 3000)
5. CORS configuration issue

**Solutions:**

1. **Check if backend server is running:**
   ```bash
   cd backend
   npm run dev
   ```
   You should see: `Server started successfully` in the console

2. **Check MongoDB is running:**
   ```bash
   # On Linux/Mac
   sudo systemctl status mongod
   # Or check if MongoDB process is running
   ps aux | grep mongod
   ```
   
   If MongoDB isn't running, start it:
   ```bash
   sudo systemctl start mongod
   # Or
   mongod
   ```

3. **Verify backend health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"ok",...}`

4. **Check backend logs:**
   ```bash
   cd backend
   tail -f logs/app-$(date +%Y-%m-%d).log
   ```
   Look for connection errors or crashes

5. **Verify environment variables:**
   - Check `backend/.env` exists
   - Verify `MONGODB_URI` is correct
   - Verify `JWT_SECRET` is set

6. **Check port availability:**
   ```bash
   # Check if port 3000 is in use
   lsof -i :3000
   # Or
   netstat -an | grep 3000
   ```

### Authentication Errors

**401 Unauthorized:**
- Token expired or invalid
- User logged out
- Solution: Log in again

**400 Bad Request:**
- Validation error (check error message)
- Missing required fields
- Invalid format (email, password strength, etc.)

**409 Conflict:**
- Username or email already exists
- Deck name already exists (case-insensitive)

### MongoDB Connection Issues

**Error:** `MongoDB connection failed`

**Solutions:**
1. Verify MongoDB is installed and running
2. Check `MONGODB_URI` in `.env`:
   - Local: `mongodb://localhost:27017/riftbound_deckbuilder`
   - Atlas: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`
3. Check MongoDB logs for connection errors
4. Verify network/firewall allows MongoDB connections

### CORS Errors

**Error:** `CORS policy: No 'Access-Control-Allow-Origin' header` or `Response to preflight request doesn't pass access control check`

**Causes:**
1. Backend server not restarted after CORS configuration changes
2. Backend not listening on all network interfaces (0.0.0.0)
3. Origin not matching allowed patterns
4. OPTIONS preflight request failing

**Solutions:**

1. **Restart the backend server** (required after CORS changes):
   ```bash
   cd backend
   # Stop server (Ctrl+C) and restart
   npm run dev
   ```

2. **Verify backend is accessible from network**:
   - Backend should listen on `0.0.0.0` (all interfaces), not just `localhost`
   - Check logs for: `host: '0.0.0.0'` in startup message

3. **Check origin matching**:
   - When accessing frontend via IP (e.g., `http://192.168.20.224:5173`)
   - Backend automatically allows local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
   - Frontend automatically uses same hostname for API calls

4. **Test CORS preflight manually**:
   ```bash
   curl -X OPTIONS http://192.168.20.224:3000/api/auth/login \
     -H "Origin: http://192.168.20.224:5173" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -v
   ```
   Should return headers:
   - `Access-Control-Allow-Origin: http://192.168.20.224:5173`
   - `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`
   - `Access-Control-Allow-Headers: Content-Type,Authorization`

5. **Check backend logs** for CORS messages:
   ```bash
   tail -f backend/logs/app-$(date +%Y-%m-%d).log | grep CORS
   ```
   Look for:
   - "CORS: Checking origin" (normal)
   - "CORS: Allowed local network IP" (success)
   - "CORS blocked origin" (failure - check pattern)

6. **Environment variable override** (if needed):
   - Set `FRONTEND_URL=http://192.168.20.224:5173` in `backend/.env`
   - Restart backend server

### Registration Key Issues

**404 Not Found:** Registration key doesn't exist
**403 Forbidden:** Registration key exhausted (no remaining uses)

**Solution:**
- Use a valid master key or user registration key
- Create master key: `npm run init-master-key` in backend directory

