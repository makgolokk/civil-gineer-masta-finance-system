from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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


class AppSettings(BaseModel):
    companyProfile: CompanyProfile = Field(default_factory=CompanyProfile)
    documentSettings: DocumentSettings = Field(default_factory=DocumentSettings)


class Client(BaseModel):
    id: str = ""
    name: str = ""
    contact: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    openingBalance: float = 0
    createdAt: str = ""


class Project(BaseModel):
    id: str = ""
    code: str = ""
    name: str = ""
    clientId: str = ""
    serviceId: str = ""


class Service(BaseModel):
    id: str = ""
    name: str = ""


class ItemLine(BaseModel):
    description: str
    serviceId: str = ""
    qty: float = 1
    rate: float = 0


class Quotation(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = ""
    number: str
    clientId: str = ""
    clientSnapshot: dict = Field(default_factory=dict)
    projectId: str = ""
    projectCode: str = ""
    projectName: str = ""
    serviceId: str = ""
    date: str = ""
    validUntil: str = ""
    status: str = "draft"
    notes: str = ""
    items: list[ItemLine] = Field(default_factory=list)
    discount: float = 0
    taxRate: float = 0
    taxAmount: float | None = None


class Invoice(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = ""
    number: str
    clientId: str = ""
    projectId: str = ""
    projectCode: str = ""
    serviceId: str = ""
    date: str = ""
    dueDate: str = ""
    status: str = "issued"
    notes: str = ""
    items: list[ItemLine] = Field(default_factory=list)
    discount: float = 0
    taxRate: float = 0
    taxAmount: float | None = None
    amountPaid: float = 0


class Receipt(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = ""
    invoiceId: str = ""
    clientId: str = ""
    receiptNumber: str
    date: str = ""
    amount: float = 0
    method: str = ""
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
    client: Client
    rows: list[StatementRow] = Field(default_factory=list)
    balance: float = 0
    openingBalance: float = 0
    fromDate: str = ""
    toDate: str = ""
    statementNumber: str = ""


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
