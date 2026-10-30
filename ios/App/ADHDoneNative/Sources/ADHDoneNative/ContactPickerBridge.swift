import Foundation
import UIKit
import Contacts
import ContactsUI
import Capacitor

/// ContactPickerBridge — Apple's own contact picker, for a birthday's phone number.
/// Same contract as the Android ContactPickerBridge (components/birthdays/ContactPickerButton.jsx):
///
///   await ContactPickerBridge.pickContact()
///     -> { cancelled, displayName, phoneNumber, email, label, contactId, lookupKey }
///
/// The picker runs outside the app, so no Contacts permission is asked for, and the
/// app only ever sees the one number or email the person taps.
@objc(ContactPickerBridge)
public class ContactPickerBridge: CAPPlugin, CAPBridgedPlugin, CNContactPickerDelegate {
    public let identifier = "ContactPickerBridge"
    public let jsName = "ContactPickerBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickContact", returnType: CAPPluginReturnPromise)
    ]

    private var pending: CAPPluginCall?

    @objc func pickContact(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let screen = self.bridge?.viewController else {
                call.reject("No screen to show the picker on.", "no-picker")
                return
            }
            // A second tap while the picker is up: the first call ends as cancelled.
            self.pending?.resolve(ContactPickerBridge.empty(cancelled: true))
            self.pending = call
            let picker = CNContactPickerViewController()
            picker.delegate = self
            picker.displayedPropertyKeys = [CNContactPhoneNumbersKey, CNContactEmailAddressesKey]
            screen.present(picker, animated: true)
        }
    }

    public func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        pending?.resolve(ContactPickerBridge.empty(cancelled: true))
        pending = nil
    }

    public func contactPicker(_ picker: CNContactPickerViewController, didSelect contactProperty: CNContactProperty) {
        let contact = contactProperty.contact
        var phone = ""
        var email = ""
        if let number = contactProperty.value as? CNPhoneNumber {
            phone = number.stringValue
        } else if let address = contactProperty.value as? String {
            email = address
        }
        let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
        let label = contactProperty.label.map { CNLabeledValue<NSString>.localizedString(forLabel: $0) } ?? ""
        pending?.resolve([
            "cancelled": false,
            "displayName": name,
            "phoneNumber": phone,
            "email": email,
            "label": label,
            "contactId": contact.identifier,
            "lookupKey": contact.identifier
        ])
        pending = nil
    }

    private static func empty(cancelled: Bool) -> [String: Any] {
        return [
            "cancelled": cancelled,
            "displayName": "",
            "phoneNumber": "",
            "email": "",
            "label": "",
            "contactId": "",
            "lookupKey": ""
        ]
    }
}
