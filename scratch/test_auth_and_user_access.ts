import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  sendPasswordResetEmail,
  getUserPermissions,
  saveUserPermissions,
  getUserActivityLogs,
  getPermissionChangeLogs,
} from "../src/lib/services/user-service";
import {
  PRIMARY_OWNER_EMAIL,
  USER_ROLES,
  STAFF_USER_ROLES,
  getDefaultPermissionsForRole,
  getAllPermissionsEnabled,
  getEmptyPermissions,
} from "../src/lib/constants";

async function runTests() {
  console.log("=================================================================");
  console.log("  RUNNING ADVANCED STAFF USER ACCESS & PERMISSION TEST SUITE");
  console.log("=================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}`);
    }
  }

  // 1. Primary Owner Configuration & Lockout Protection
  assert(PRIMARY_OWNER_EMAIL === "atiqjehandaraz@gmail.com", "Primary Owner email matches atiqjehandaraz@gmail.com");

  const users = await getUsers();
  const owner = users.find((u) => u.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase());
  assert(!!owner, "Primary Owner exists in registry");
  assert(owner?.role === "owner", "Primary Owner has OWNER role");
  assert(owner?.status === "active", "Primary Owner status is ACTIVE");

  const ownerPerms = await getUserPermissions(owner!.id);
  assert(ownerPerms.dashboard.access === true, "Owner has Dashboard access");
  assert(ownerPerms.accounts.access === true, "Owner has Accounts access");
  assert(ownerPerms.accounts.can_transfer === true, "Owner has transfer_money permission");
  assert(ownerPerms.user_access.access === true, "Owner has User Access permission");

  // 2. Lockout Guards: Cannot deactive, demote, or delete Owner
  const deactOwnerRes = await updateUser(owner!.id, { status: "suspended" }, { id: "usr-owner-001", name: "Owner", role: "owner" });
  assert(deactOwnerRes.success === false, "Security: Owner cannot be suspended or deactivated");

  const demoteOwnerRes = await updateUser(owner!.id, { role: "receptionist" }, { id: "usr-owner-001", name: "Owner", role: "owner" });
  assert(demoteOwnerRes.success === false, "Security: Owner role cannot be demoted");

  const deleteOwnerRes = await deleteUser(owner!.id, { id: "usr-owner-001", name: "Owner", role: "owner" });
  assert(deleteOwnerRes.success === false, "Security: Owner account cannot be deleted");

  // 3. Role Templates Verification
  const accountantTemplate = getDefaultPermissionsForRole("accountant");
  assert(accountantTemplate.accounts.access === true, "Accountant role template has Accounts access");
  assert(accountantTemplate.invoices.access === true, "Accountant role template has Invoices access");
  assert(accountantTemplate.accounts.can_transfer === false, "Accountant role cannot transfer money by default");

  const receptionistTemplate = getDefaultPermissionsForRole("receptionist");
  assert(receptionistTemplate.job_cards.access === true, "Receptionist has Job Cards access");
  assert(receptionistTemplate.accounts.access === false, "Receptionist does NOT have Accounts access");
  assert(receptionistTemplate.user_access.access === false, "Receptionist does NOT have User Access");

  const mechanicTemplate = getDefaultPermissionsForRole("mechanic");
  assert(mechanicTemplate.job_cards.can_edit === true, "Mechanic can edit Job Card progress");
  assert(mechanicTemplate.job_cards.can_delete === false, "Mechanic cannot delete Job Cards");
  assert(mechanicTemplate.invoices.access === false, "Mechanic cannot access Invoices");

  // 4. Create Receptionist Staff User with Default Role
  const receptionistEmail = `test-reception-${Date.now()}@atiqjehan.ae`;
  const createRecRes = await createUser({
    email: receptionistEmail,
    full_name: "Amina Al-Mansoor",
    role: "receptionist",
    status: "active",
    phone: "+971 50 111 2222",
    job_title: "Service Advisor",
    creatorRole: "owner",
    operator: { id: owner!.id, name: owner!.full_name },
  });

  assert(!!createRecRes.user, "Owner successfully created Receptionist staff user");
  assert(createRecRes.user?.role === "receptionist", "User role is receptionist");
  assert(createRecRes.user?.status === "active", "User status is active");

  // 5. Custom Granular Permissions Overriding Role Template
  const recUserId = createRecRes.user!.id;
  const currentRecPerms = await getUserPermissions(recUserId);
  assert(currentRecPerms.accounts.access === false, "Initial receptionist accounts access is false");

  // Owner grants custom Accounts View permission to this specific receptionist
  currentRecPerms.accounts.access = true;
  currentRecPerms.accounts.can_view = true;
  const savePermsRes = await saveUserPermissions(recUserId, currentRecPerms, {
    id: owner!.id,
    name: owner!.full_name,
  });
  assert(savePermsRes.success === true, "Owner successfully saved custom granular permissions");

  const updatedRecPerms = await getUserPermissions(recUserId);
  assert(updatedRecPerms.accounts.access === true, "Updated permission: Receptionist now has Accounts access");
  assert(updatedRecPerms.accounts.can_transfer === false, "Receptionist still cannot transfer money");

  // 6. Permission Audit Change Logs
  const permChangeLogs = await getPermissionChangeLogs(recUserId);
  assert(permChangeLogs.length > 0, "Permission change log recorded operator diff");
  assert(permChangeLogs[0].target_user_id === recUserId, "Log target user matches receptionist");

  // 7. Staff Suspension Flow
  const suspendRes = await updateUser(
    recUserId,
    { status: "suspended" },
    { id: owner!.id, name: owner!.full_name, role: "owner" }
  );
  assert(suspendRes.success === true, "Owner can suspend staff account");

  const suspendedUser = await getUserById(recUserId);
  assert(suspendedUser?.status === "suspended", "Staff account status is SUSPENDED");
  assert(suspendedUser?.is_active === false, "is_active is synced to false");

  // 8. Staff Reactivation Flow
  const activateRes = await updateUser(
    recUserId,
    { status: "active" },
    { id: owner!.id, name: owner!.full_name, role: "owner" }
  );
  assert(activateRes.success === true, "Owner can reactivate staff account");

  const reactivatedUser = await getUserById(recUserId);
  assert(reactivatedUser?.status === "active", "Staff account is restored to ACTIVE");

  // 9. Activity Logs Tracking
  const activityLogs = await getUserActivityLogs();
  assert(activityLogs.length > 0, "User activity logs are tracked");
  const hasUserCreationLog = activityLogs.some((l) => l.action === "USER_CREATED");
  assert(hasUserCreationLog, "USER_CREATED action was logged in audit history");

  // 10. Clean up
  await deleteUser(recUserId, { id: owner!.id, name: owner!.full_name, role: "owner" });
  const deletedCheck = await getUserById(recUserId);
  assert(deletedCheck === null, "Staff account was cleaned up");

  console.log("\n=================================================================");
  console.log(`  RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log("=================================================================\n");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
