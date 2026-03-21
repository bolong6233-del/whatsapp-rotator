import { useEffect } from 'react';

function handleToggleStatus(order, newStatus) {
    // Logic to update whatsapp_numbers where label matches order.ticket_name
    const matchingNumbers = whatsapp_numbers.filter((number) => number.label === order.ticket_name);

    // Update the status of matching numbers
    matchingNumbers.forEach((number) => {
        number.status = newStatus; // Use the new status
    });

    // Reactivate numbers if newStatus is active
    if (newStatus === 'active') {
        matchingNumbers.forEach((number) => {
            number.active = true; // Reactivate the number
        });
    }
}

// Other components and hooks...

// Assuming whatsapp_numbers is available in scope
export default handleToggleStatus;