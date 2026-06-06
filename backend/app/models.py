from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


def first_value(data: dict[str, Any], *keys: str, default: Any = "") -> Any:
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return default


class BankingDetails(BaseModel):
    bank: str = ""
    accountHolder: str = ""
    accountType: str = ""
    accountNumber: str = ""
    branchName: str = ""
    branchCode: str = ""


class CompanyProfile(BaseModel):
    name: str = "Civil-Gineer Masta (Pty) Ltd"
    tradingName: str = "Civil-Gineer Masta"
    registrationNumber: str = ""
    taxVatNumber: str = ""
    address: str = "Plot 31848, Gaborone North, Gaborone, Botswana"
    phone: str = "+267 71839730"
    alternatePhone: str = "+267 77008234"
    email: str = "makgolokk@outlook.com"
    website: str = ""
    logoPath: str = "assets/logo.png"
    letterhead: str = "BUILDING THE FUTURE, MASTERING THE PRESENT"
    footerText: str = "Thank you for your business."
    defaultNotes: str = ""
    defaultTerms: str = "Payment due strictly as per agreed milestones or due date stated on the document."
    preparedBy: str = "Kelesitse K. Makgolo"
    approvedBy: str = ""
    bankingDetails: BankingDetails = Field(default_factory=BankingDetails)


class DocumentSettings(BaseModel):
    currency: str = "BWP"
    vatEnabled: bool = False
    vatRate: float = 0
    defaultDiscount: float = 0


class SignatoryProfile(BaseModel):
    id: str = ""
    name: str = ""
    title: str = "Authorised Signatory"
    signatureImage: str = ""
    active: bool = True


class DocumentSignatories(BaseModel):
    preparedById: str = "kelesitse-makgolo"
    approvedById: str = "boago-modise"
    profiles: list[SignatoryProfile] = Field(default_factory=list)


class AppSettings(BaseModel):
    companyProfile: CompanyProfile = Field(default_factory=CompanyProfile)
    documentSettings: DocumentSettings = Field(default_factory=DocumentSettings)
    documentSignatories: DocumentSignatories = Field(default_factory=DocumentSignatories)


class Client(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = ""
    name: str = Field(default="", validation_alias=AliasChoices("name", "clientName", "company"))
    contact: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    openingBalance: float = 0
    createdAt: str = ""


class Project(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = ""
    code: str = ""
    name: str = ""
    clientId: str = ""
    serviceId: str = ""
    location: str = ""


class Service(BaseModel):
    id: str = ""
    name: str = ""


class ItemLine(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    description: str = Field(default="", validation_alias=AliasChoices("description", "name", "item", "particulars"))
    serviceId: str = ""
    qty: float = Field(default=1, validation_alias=AliasChoices("qty", "quantity"))
    unit: str = Field(default="", validation_alias=AliasChoices("unit", "uom", "measure"))
    rate: float = Field(default=0, validation_alias=AliasChoices("rate", "unitPrice", "price"))


class Quotation(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = ""
    number: str = Field(default="", validation_alias=AliasChoices("number", "documentNumber", "quotationNumber"))
    clientId: str = ""
    clientSnapshot: dict = Field(default_factory=dict)
    projectId: str = ""
    projectCode: str = ""
    projectName: str = ""
    location: str = ""
    serviceId: str = ""
    date: str = Field(default="", validation_alias=AliasChoices("date", "issueDate"))
    validUntil: str = Field(default="", validation_alias=AliasChoices("validUntil", "dueDate"))
    status: str = "draft"
    notes: str = ""
    exclusions: str = ""
    paymentTerms: str = ""
    preparedBy: str = ""
    approvedBy: str = ""
    items: list[ItemLine] = Field(default_factory=list, validation_alias=AliasChoices("items", "lineItems"))
    discount: float = 0
    taxRate: float = Field(default=0, validation_alias=AliasChoices("taxRate", "vatRate"))
    taxAmount: float | None = Field(default=None, validation_alias=AliasChoices("taxAmount", "vat", "tax"))
    total: float | None = Field(default=None, validation_alias=AliasChoices("total", "grandTotal"))

    @model_validator(mode="before")
    @classmethod
    def normalize_document(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        next_data = dict(data)
        if not next_data.get("clientSnapshot"):
            client = next_data.get("client") if isinstance(next_data.get("client"), dict) else {}
            name = first_value(next_data, "clientName", "company", default=client.get("name", ""))
            if name:
                next_data["clientSnapshot"] = {
                    "name": name,
                    "contact": client.get("contact", ""),
                    "email": first_value(next_data, "clientEmail", default=client.get("email", "")),
                    "phone": first_value(next_data, "clientPhone", default=client.get("phone", "")),
                    "address": first_value(next_data, "clientAddress", default=client.get("address", "")),
                }
        return next_data


class Invoice(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = ""
    number: str = Field(default="", validation_alias=AliasChoices("number", "documentNumber", "invoiceNumber"))
    clientId: str = ""
    projectId: str = ""
    projectCode: str = ""
    projectName: str = ""
    location: str = ""
    serviceId: str = ""
    date: str = Field(default="", validation_alias=AliasChoices("date", "issueDate"))
    dueDate: str = Field(default="", validation_alias=AliasChoices("dueDate", "validUntil"))
    status: str = "issued"
    notes: str = ""
    exclusions: str = ""
    paymentTerms: str = ""
    preparedBy: str = ""
    approvedBy: str = ""
    items: list[ItemLine] = Field(default_factory=list, validation_alias=AliasChoices("items", "lineItems"))
    discount: float = 0
    taxRate: float = Field(default=0, validation_alias=AliasChoices("taxRate", "vatRate"))
    taxAmount: float | None = Field(default=None, validation_alias=AliasChoices("taxAmount", "vat", "tax"))
    total: float | None = Field(default=None, validation_alias=AliasChoices("total", "grandTotal"))
    amountPaid: float = 0
    balanceDue: float | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_document(cls, data: Any) -> Any:
        return Quotation.normalize_document(data)


class Receipt(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = ""
    invoiceId: str = ""
    clientId: str = ""
    receiptNumber: str = Field(default="", validation_alias=AliasChoices("receiptNumber", "documentNumber", "number"))
    date: str = Field(default="", validation_alias=AliasChoices("date", "issueDate", "dateReceived"))
    amount: float = Field(default=0, validation_alias=AliasChoices("amount", "amountReceived", "paid"))
    method: str = Field(default="", validation_alias=AliasChoices("method", "paymentMethod"))
    reference: str = ""
    bankAccountId: str = ""
    status: str = "paid"


class StatementRow(BaseModel):
    date: str = ""
    type: str = ""
    number: str = ""
    debit: float = 0
    credit: float = 0
    balance: float = 0


class ClientStatement(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    client: Client = Field(default_factory=Client)
    rows: list[StatementRow] = Field(default_factory=list, validation_alias=AliasChoices("rows", "transactions"))
    balance: float = 0
    openingBalance: float = 0
    fromDate: str = ""
    toDate: str = ""
    statementNumber: str = ""

    @model_validator(mode="before")
    @classmethod
    def normalize_statement(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        next_data = dict(data)
        if not next_data.get("client"):
            next_data["client"] = {
                "name": first_value(next_data, "clientName", "company", default="Client"),
                "email": next_data.get("clientEmail", ""),
                "phone": next_data.get("clientPhone", ""),
                "address": next_data.get("clientAddress", ""),
            }
        return next_data


class ExportContext(BaseModel):
    settings: AppSettings = Field(default_factory=AppSettings)
    clients: list[Client] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    services: list[Service] = Field(default_factory=list)
    invoices: list[Invoice] = Field(default_factory=list)
    payments: list[Receipt] = Field(default_factory=list)


class QuotationExportRequest(BaseModel):
    document: Quotation
    context: ExportContext = Field(default_factory=ExportContext)
    filename: str | None = None


class InvoiceExportRequest(BaseModel):
    document: Invoice
    context: ExportContext = Field(default_factory=ExportContext)
    filename: str | None = None


class ReceiptExportRequest(BaseModel):
    receipt: Receipt
    context: ExportContext = Field(default_factory=ExportContext)
    filename: str | None = None


class StatementExportRequest(BaseModel):
    statement: ClientStatement
    context: ExportContext = Field(default_factory=ExportContext)
    filename: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    environment: str
