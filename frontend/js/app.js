
const loadButton = document.getElementById("loadInventory");
const message = document.getElementById("message");
const inventoryList = document.getElementById("inventoryList");

const sampleItems = [
    { name: "USB Cable", quantity: 24 },
    { name: "Wireless Mouse", quantity: 3 },
    { name: "Keyboard", quantity: 12 }
];

function renderItems(items) {
    inventoryList.replaceChildren();

    items.forEach(function (item) {
        const li = document.createElement("li");
        li.textContent = item.name + " - Qty: " + item.quantity;
        inventoryList.appendChild(li);
    });
}

loadButton.addEventListener("click", async () => {
    renderItems(sampleItems);
    message.textContent = "Showing sample data. API connection is not configured yet.";
});