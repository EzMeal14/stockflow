const user = requireRole('staff');
if (user) {
  if (!user.warehouse_id) {
    setMessage('page-message', 'This staff account has no warehouse yet. Ask an admin to assign one.', false);
  } else {
    // Staff only ever work with their own warehouse
    initOps({ warehouseId: user.warehouse_id });
  }
}
