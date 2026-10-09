Attribute VB_Name = "RuedaGiratoria"
Option Explicit
'======================================================================
' RUEDA GIRATORIA CON RODAMIENTO DE BOLAS - piezas sueltas + conjunto
' SolidWorks VBA (probado el patron en SW 2020 espanol; ESTA MACRO NO SE
' HA PODIDO EJECUTAR en SolidWorks al escribirla: revisar avisos finales)
'
' Crea y guarda en  %USERPROFILE%\Documents\rueda_giratoria\  estas piezas:
'   Horquilla, Rueda, Eje, Tornillo, Tuerca, PistaInferior,
'   DiscoSuperior, Bola
' y despues el conjunto  Conjunto_rueda.SLDASM  (componentes fijos en su
' posicion; sin relaciones de posicion: anadelas luego si las quieres).
'
' ORIGEN DE LAS MEDIDAS (mm):
'   [O] cota original del plano   [M] medida sobre el dibujo (+-0,4)
'   [C] calculada                 [E] estimada / supuesta (revisar)
'
' EJES: Horquilla, Rueda y Eje: eje de la pieza = Z, Z >= 0.
'       Tornillo, Tuerca, Pista, Disco y Bola: eje de la pieza = Y, Y >= 0.
' CONJUNTO: Y hacia arriba, X = sentido de rodadura, Z = eje de la rueda,
'   cara superior exterior de la horquilla en Y = 0, giro en X = 0.
'
' USO: Herramientas > Macro > Editar > importar este .bas > F5 en "main".
'   "SoloConjunto" vuelve a montar el conjunto con las piezas ya guardadas.
'======================================================================

Dim swApp As SldWorks.SldWorks
Dim Part As SldWorks.ModelDoc2
Dim eqMgr As SldWorks.EquationMgr
Dim mUtil As SldWorks.MathUtility
Dim gXf As SldWorks.MathTransform, gXi As SldWorks.MathTransform
Dim plFront As SldWorks.Feature, plTop As SldWorks.Feature, plRight As SldWorks.Feature, featOrigin As SldWorks.Feature
Dim gLog As String
Dim gOrg As SldWorks.SketchPoint
Dim gDir As String

Const PI As Double = 3.14159265358979

' ---------------- MEDIDAS ----------------
' Horquilla
Const ANCHO_EXT As Double = 45.5      ' [O] ancho exterior de la horquilla
Const PARED As Double = 4.8           ' [M] espesor de cada pared lateral
Const ANCHO_SUP As Double = 39.7      ' [O] ancho de la placa superior (en X)
Const E_PUENTE As Double = 5          ' [M] espesor del puente superior
Const R_PUNTA As Double = 15.9        ' [O] radio del extremo inferior (medido 16,1)
Const PROF_EJE As Double = 41.3       ' [O] eje de la rueda por debajo de la cara superior
Const OFF_EJE As Double = 8.7         ' [O] eje de la rueda respecto al eje de giro
' Eje de la rueda
Const D_EJE As Double = 9.6           ' [O] diametro del eje (medido 10,0)
Const L_EJE As Double = 52.4          ' [M] longitud total
Const E_CABEZA As Double = 4.8        ' [O] sobresale de la pared izquierda
Const D_COLLAR As Double = 16.1       ' [M] collar del extremo derecho
Const E_COLLAR As Double = 2          ' [M]
' Rueda
Const D_RUEDA As Double = 57.4        ' [O]
Const E_BANDA As Double = 4.9         ' [O] espesor radial de la banda
Const ANCHO_RUEDA As Double = 30.2    ' [O]
Const E_NERVIO As Double = 6.5        ' [M] espesor del nervio central
Const D_CUBO As Double = 23           ' [M] diametro del cubo (estimado de la seccion)
Const L_CUBO As Double = 35           ' [M] largo del cubo, entre paredes
' Tornillo (vastago de giro) y tuerca
Const D_VASTAGO As Double = 17.7      ' [O] cana
Const L_VASTAGO As Double = 41.9      ' [O] longitud total
Const L_ROSCA As Double = 18.8        ' [M] tramo de rosca + cuello
Const D_ROSCA As Double = 12.2        ' [M] M12 probable
Const ANCHO_RANURA As Double = 1.8    ' [M]
Const PROF_RANURA As Double = 2.3     ' [M]
Const AC_TUERCA As Double = 21.7      ' [O] ancho entre vertices
Const H_TUERCA As Double = 12.2       ' [O] altura total con brida
Const D_BRIDA As Double = 24          ' [M]
Const E_BRIDA As Double = 1.2         ' [E]
Const Y_TORN As Double = -7.2         ' [M] extremo inferior del vastago bajo la cara superior
Const Y_TUERCA As Double = 19         ' [M] cara inferior de la brida
' Rodamiento de bolas
Const D_PISTA As Double = 50.1        ' [M] pista inferior
Const E_PISTA As Double = 4.6         ' [O]
Const D_DISCO As Double = 57.9        ' [O] disco superior
Const D_BOLA As Double = 5.8          ' [O] diametro de las bolas
Const D_PASO As Double = 41.6         ' [M] circulo de centros de las bolas
Const Y_BOLA As Double = 7.67         ' [M] altura de los centros sobre la cara superior de la horquilla
Const N_BOLAS As Integer = 14         ' [E] NO MEDIBLE en la imagen: cambiar aqui
' Disco superior (forma de plato, estimada)
Const Y_DISCO_TOP As Double = 13.9    ' [M] cara superior
Const R_DISCO_PLANO As Double = 20.3  ' [M] radio de la zona plana
Const CAIDA_DISCO As Double = 5.9     ' [E] descenso del borde
Const E_DISCO As Double = 2.5         ' [E] espesor de chapa
Const R_HUECO_DISCO As Double = 9.5   ' [E] hueco central (holgura sobre la cana)
Const ZC As Double = 22.75            ' [C] ANCHO_EXT / 2

'======================================================================
Sub main()
    Dim oldIn As Boolean
    On Error GoTo EH
    Set swApp = Application.SldWorks
    Set mUtil = swApp.GetMathUtility
    gDir = Environ("USERPROFILE") & "\Documents\rueda_giratoria\"
    On Error Resume Next
    If Dir(gDir, vbDirectory) = "" Then MkDir gDir
    On Error GoTo EH
    oldIn = swApp.GetUserPreferenceToggle(swInputDimValOnCreate)
    swApp.SetUserPreferenceToggle swInputDimValOnCreate, False

    CrearHorquilla
    CrearRueda
    CrearEje
    CrearTornillo
    CrearTuerca
    CrearPista
    CrearDisco
    CrearBola
    CrearConjunto

    swApp.SetUserPreferenceToggle swInputDimValOnCreate, oldIn
    If gLog = "" Then
        MsgBox "Piezas y conjunto creados en:" & vbCrLf & gDir, vbInformation
    Else
        MsgBox "Terminado con avisos:" & vbCrLf & gLog, vbExclamation
    End If
    Exit Sub
EH:
    swApp.SetUserPreferenceToggle swInputDimValOnCreate, oldIn
    MsgBox "Error " & Err.Number & ": " & Err.Description & vbCrLf & gLog, vbCritical
End Sub

Sub SoloConjunto()
    Dim oldIn As Boolean
    On Error GoTo EH
    Set swApp = Application.SldWorks
    Set mUtil = swApp.GetMathUtility
    gDir = Environ("USERPROFILE") & "\Documents\rueda_giratoria\"
    CrearConjunto
    If gLog = "" Then MsgBox "Conjunto creado.", vbInformation Else MsgBox "Conjunto con avisos:" & vbCrLf & gLog, vbExclamation
    Exit Sub
EH:
    MsgBox "Error " & Err.Number & ": " & Err.Description & vbCrLf & gLog, vbCritical
End Sub

'======================================================================
' PIEZAS
'======================================================================

' ---------- 1. HORQUILLA (eje Z; cara superior en Y=0; paredes en Z 0..PARED y ANCHO_EXT-PARED..ANCHO_EXT)
Private Sub CrearHorquilla()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature, r As Variant, hs As Double
    NuevaPieza
    Gv "ANCHO_EXT", ANCHO_EXT: Gv "PARED", PARED: Gv "ANCHO_SUP", ANCHO_SUP
    Gv "E_PUENTE", E_PUENTE: Gv "R_PUNTA", R_PUNTA: Gv "PROF_EJE", PROF_EJE
    Gv "OFF_EJE", OFF_EJE: Gv "D_EJE", D_EJE
    hs = ANCHO_SUP / 2

    ' Puente superior: placa ANCHO_SUP x E_PUENTE x ANCHO_EXT
    Begin plFront
    r = RectF(-hs, -E_PUENTE, hs, 0, True, 0)
    Set sk = EndSk("Sk_Puente")
    Link sk, "39.7=""ANCHO_SUP"";5=""E_PUENTE"""
    Set f = Boss(sk, ANCHO_EXT, 1, "Puente")
    Link f, "45.5=""ANCHO_EXT"""

    ' Pared 1: cuadrilatero (borde izquierdo inclinado) + punta redonda
    Begin plFront
    Quad -hs, 0, hs, 0, OFF_EJE + R_PUNTA, -PROF_EJE, OFF_EJE - R_PUNTA, -PROF_EJE
    Set sk = EndSk("Sk_Pared")
    Set f = Boss(sk, PARED, 1, "Pared_1")
    Begin plFront
    CircleF OFF_EJE, -PROF_EJE, 0, R_PUNTA, False
    Set sk = EndSk("Sk_Punta")
    Link sk, "31.8=""R_PUNTA""*2"
    Set f = Boss(sk, PARED, 1, "Punta_1")

    ' Pared 2 (misma forma, al otro lado)
    Begin plFront
    Quad -hs, 0, hs, 0, OFF_EJE + R_PUNTA, -PROF_EJE, OFF_EJE - R_PUNTA, -PROF_EJE
    Set sk = EndSk("Sk_Pared2")
    Set f = BossOffZ(sk, ANCHO_EXT - PARED, PARED, "Pared_2")
    Begin plFront
    CircleF OFF_EJE, -PROF_EJE, 0, R_PUNTA, False
    Set sk = EndSk("Sk_Punta2")
    Set f = BossOffZ(sk, ANCHO_EXT - PARED, PARED, "Punta_2")

    ' Taladro del eje en las dos paredes
    Begin plFront
    CircleF OFF_EJE, -PROF_EJE, 0, D_EJE / 2, False
    Set sk = EndSk("Sk_TaladroEje")
    Link sk, "9.6=""D_EJE"""
    Set f = CutOff(sk, 0, ANCHO_EXT, "Taladro_eje")

    ' Taladro del vastago en el puente (croquis en Planta, corte simetrico)
    Begin plTop
    CircleF 0, 0, ZC, D_VASTAGO / 2, False
    Set sk = EndSk("Sk_TaladroVastago")
    Set f = CutMid(sk, 20, "Taladro_vastago")

    GuardarPieza "Horquilla"
End Sub

' ---------- 2. RUEDA (eje Z; cubo en Z 0..L_CUBO; centro en el origen)
Private Sub CrearRueda()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature
    NuevaPieza
    Gv "D_RUEDA", D_RUEDA: Gv "E_BANDA", E_BANDA: Gv "ANCHO_RUEDA", ANCHO_RUEDA
    Gv "E_NERVIO", E_NERVIO: Gv "D_CUBO", D_CUBO: Gv "L_CUBO", L_CUBO: Gv "D_EJE", D_EJE

    Begin plFront
    CircleF 0, 0, 0, D_CUBO / 2, False
    Set sk = EndSk("Sk_Cubo")
    Link sk, "23=""D_CUBO"""
    Set f = Boss(sk, L_CUBO, 1, "Cubo")

    Begin plFront
    CircleF 0, 0, 0, (D_RUEDA - 2 * E_BANDA) / 2, False
    Set sk = EndSk("Sk_Nervio")
    Set f = BossOffZ(sk, (L_CUBO - E_NERVIO) / 2, E_NERVIO, "Nervio")

    Begin plFront
    CircleF 0, 0, 0, D_RUEDA / 2, False
    CircleF 0, 0, 0, (D_RUEDA - 2 * E_BANDA) / 2, False
    Set sk = EndSk("Sk_Banda")
    Link sk, "57.4=""D_RUEDA"""
    Set f = BossOffZ(sk, (L_CUBO - ANCHO_RUEDA) / 2, ANCHO_RUEDA, "Banda")

    Begin plFront
    CircleF 0, 0, 0, D_EJE / 2, False
    Set sk = EndSk("Sk_Taladro")
    Link sk, "9.6=""D_EJE"""
    Set f = CutOff(sk, 0, L_CUBO, "Taladro_eje")

    GuardarPieza "Rueda"
End Sub

' ---------- 3. EJE DE LA RUEDA (eje Z; Z 0..L_EJE; cabeza en Z 0..E_CABEZA)
Private Sub CrearEje()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature
    NuevaPieza
    Gv "D_EJE", D_EJE: Gv "L_EJE", L_EJE: Gv "D_COLLAR", D_COLLAR: Gv "E_COLLAR", E_COLLAR

    Begin plFront
    CircleF 0, 0, 0, D_EJE / 2, False
    Set sk = EndSk("Sk_Eje")
    Link sk, "9.6=""D_EJE"""
    Set f = Boss(sk, L_EJE, 1, "Eje")
    Link f, "52.4=""L_EJE"""

    Begin plFront
    CircleF 0, 0, 0, D_COLLAR / 2, False
    Set sk = EndSk("Sk_Collar")
    Link sk, "16.1=""D_COLLAR"""
    Set f = BossOffZ(sk, L_EJE - E_COLLAR, E_COLLAR, "Collar")

    GuardarPieza "Eje"
End Sub

' ---------- 4. TORNILLO / VASTAGO DE GIRO (eje Y; Y 0..L_VASTAGO; rosca arriba)
Private Sub CrearTornillo()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature, r As Variant
    NuevaPieza
    Gv "D_VASTAGO", D_VASTAGO: Gv "L_VASTAGO", L_VASTAGO: Gv "L_ROSCA", L_ROSCA
    Gv "D_ROSCA", D_ROSCA: Gv "ANCHO_RANURA", ANCHO_RANURA: Gv "PROF_RANURA", PROF_RANURA

    Begin plTop
    CircleF 0, 0, 0, D_VASTAGO / 2, False
    Set sk = EndSk("Sk_Cana")
    Link sk, "17.7=""D_VASTAGO"""
    Set f = BossY(sk, 0, L_VASTAGO - L_ROSCA, "Cana")

    Begin plTop
    CircleF 0, 0, 0, D_ROSCA / 2, False
    Set sk = EndSk("Sk_Rosca")
    Link sk, "12.2=""D_ROSCA"""
    Set f = BossY(sk, L_VASTAGO - L_ROSCA, L_ROSCA, "Tramo_roscado")

    ' Ranura de destornillador en el extremo (croquis en Alzado, corte simetrico en Z)
    Begin plFront
    r = RectF(-ANCHO_RANURA / 2, L_VASTAGO - PROF_RANURA, ANCHO_RANURA / 2, L_VASTAGO + 1, True, 0)
    Set sk = EndSk("Sk_Ranura")
    Set f = CutMid(sk, 20, "Ranura")

    PropTexto "Rosca", "M12 (paso probable 1,75 - grueso ISO; no medible en el plano)"
    PropTexto "Nota", "Rosca no modelada: representar como rosca cosmetica M12"
    GuardarPieza "Tornillo"
End Sub

' ---------- 5. TUERCA HEXAGONAL CON BRIDA (eje Y; brida abajo)
Private Sub CrearTuerca()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature, k As Integer, rr As Double
    Dim a1 As Double, a2 As Double
    NuevaPieza
    Gv "D_BRIDA", D_BRIDA: Gv "E_BRIDA", E_BRIDA: Gv "H_TUERCA", H_TUERCA: Gv "D_ROSCA", D_ROSCA

    Begin plTop
    CircleF 0, 0, 0, D_BRIDA / 2, False
    Set sk = EndSk("Sk_Brida")
    Link sk, "24=""D_BRIDA"""
    Set f = BossY(sk, 0, E_BRIDA, "Brida")

    ' Hexagono: vertices a AC/2 del eje (AF = AC * 0,866)
    Begin plTop
    rr = AC_TUERCA / 2
    For k = 0 To 5
        a1 = k * PI / 3: a2 = (k + 1) * PI / 3
        LineT rr * Cos(a1), rr * Sin(a1), rr * Cos(a2), rr * Sin(a2)
    Next
    Set sk = EndSk("Sk_Hexagono")
    Set f = BossY(sk, E_BRIDA, H_TUERCA - E_BRIDA, "Hexagono")

    Begin plTop
    CircleF 0, 0, 0, D_ROSCA / 2, False
    Set sk = EndSk("Sk_Agujero")
    Link sk, "12.2=""D_ROSCA"""
    Set f = CutMid(sk, 30, "Agujero")

    PropTexto "Rosca", "M12 (paso probable 1,75)"
    GuardarPieza "Tuerca"
End Sub

' ---------- 6. PISTA INFERIOR del rodamiento (eje Y; Y 0..E_PISTA)
Private Sub CrearPista()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature
    NuevaPieza
    Gv "D_PISTA", D_PISTA: Gv "E_PISTA", E_PISTA: Gv "D_VASTAGO", D_VASTAGO

    Begin plTop
    CircleF 0, 0, 0, D_PISTA / 2, False
    CircleF 0, 0, 0, D_VASTAGO / 2, False
    Set sk = EndSk("Sk_Pista")
    Link sk, "50.1=""D_PISTA"";17.7=""D_VASTAGO"""
    Set f = BossY(sk, 0, E_PISTA, "Pista")

    GuardarPieza "PistaInferior"
End Sub

' ---------- 7. DISCO SUPERIOR en forma de plato (revolucion sobre el eje Y)
' Coordenadas Y medidas desde la cara superior de la horquilla (se coloca en 0,0,ZC)
Private Sub CrearDisco()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature
    Dim rO As Double, yT As Double
    NuevaPieza
    rO = D_DISCO / 2: yT = Y_DISCO_TOP
    Begin plFront
    LineF R_HUECO_DISCO, yT, R_DISCO_PLANO, yT
    LineF R_DISCO_PLANO, yT, rO, yT - CAIDA_DISCO
    LineF rO, yT - CAIDA_DISCO, rO, yT - CAIDA_DISCO - E_DISCO
    LineF rO, yT - CAIDA_DISCO - E_DISCO, R_DISCO_PLANO, yT - E_DISCO
    LineF R_DISCO_PLANO, yT - E_DISCO, R_HUECO_DISCO, yT - E_DISCO
    LineF R_HUECO_DISCO, yT - E_DISCO, R_HUECO_DISCO, yT
    CenterF 0, yT - CAIDA_DISCO - E_DISCO - 1, 0, yT + 1
    Set sk = EndSk("Sk_Perfil")
    Set f = RevolveSk(sk, "Revolucion")
    If f Is Nothing Then
        ' Alternativa si falla la revolucion: anillo plano (aviso en el registro)
        gLog = gLog & "DiscoSuperior: revolucion fallida, se uso un anillo plano" & vbCrLf
        Begin plTop
        CircleF 0, 0, 0, rO, False
        CircleF 0, 0, 0, R_HUECO_DISCO, False
        Set sk = EndSk("Sk_Anillo")
        Set f = BossY(sk, yT - E_DISCO, E_DISCO, "Anillo")
    End If
    PropTexto "Nota", "Forma de plato ESTIMADA (espesor y caida supuestos)"
    GuardarPieza "DiscoSuperior"
End Sub

' ---------- 8. BOLA (esfera centrada en el origen)
Private Sub CrearBola()
    Dim sk As SldWorks.Feature, f As SldWorks.Feature, rb As Double
    Dim cc As Variant, p1 As Variant, p2 As Variant
    NuevaPieza
    rb = D_BOLA / 2
    Begin plFront
    cc = ToSk(0, 0, 0): p1 = ToSk(0, -rb, 0): p2 = ToSk(0, rb, 0)
    If Part.SketchManager.CreateArc(cc(0), cc(1), 0, p1(0), p1(1), 0, p2(0), p2(1), 0, 1) Is Nothing Then gLog = gLog & "Bola: arco no creado" & vbCrLf
    LineF 0, rb, 0, -rb
    CenterF 0, rb, 0, -rb
    Set sk = EndSk("Sk_Bola")
    Set f = RevolveSk(sk, "Esfera")
    If f Is Nothing Then
        gLog = gLog & "Bola: revolucion fallida, se uso un cilindro" & vbCrLf
        Begin plTop
        CircleF 0, 0, 0, rb, False
        Set sk = EndSk("Sk_Cilindro")
        Set f = BossY(sk, 0, D_BOLA, "Cilindro")
    End If
    GuardarPieza "Bola"
End Sub

'======================================================================
' CONJUNTO (componentes fijos, solo traslaciones)
'======================================================================
Private Sub CrearConjunto()
    Dim asmDoc As SldWorks.ModelDoc2, asm As SldWorks.AssemblyDoc
    Dim i As Integer, ang As Double, rb As Double
    Set asmDoc = swApp.NewDocument(swApp.GetUserPreferenceStringValue(swDefaultTemplateAssembly), 0, 0, 0)
    If asmDoc Is Nothing Then gLog = gLog & "No se pudo crear el conjunto" & vbCrLf: Exit Sub
    Set asm = asmDoc
    Colocar asm, "Horquilla", 0, 0, 0
    Colocar asm, "Rueda", OFF_EJE, -PROF_EJE, (ANCHO_EXT - L_CUBO) / 2
    Colocar asm, "Eje", OFF_EJE, -PROF_EJE, -E_CABEZA
    Colocar asm, "Tornillo", 0, Y_TORN, ZC
    Colocar asm, "Tuerca", 0, Y_TUERCA, ZC
    Colocar asm, "PistaInferior", 0, 0, ZC
    Colocar asm, "DiscoSuperior", 0, 0, ZC
    rb = D_PASO / 2
    For i = 0 To N_BOLAS - 1
        ang = 2 * PI * i / N_BOLAS
        Colocar asm, "Bola", rb * Cos(ang), Y_BOLA, ZC + rb * Sin(ang)
    Next
    asmDoc.ShowNamedView2 "*Isometric", 7
    asmDoc.ViewZoomtofit2
    asmDoc.SaveAs3 gDir & "Conjunto_rueda.SLDASM", 0, 2
End Sub

' Inserta una pieza guardada y la deja fija en (x,y,z) mm, sin rotacion
Private Sub Colocar(ByVal asm As SldWorks.AssemblyDoc, ByVal nombre As String, ByVal x As Double, ByVal y As Double, ByVal z As Double)
    Dim comp As SldWorks.Component2, a(15) As Double, xf As SldWorks.MathTransform
    Set comp = asm.AddComponent5(gDir & nombre & ".SLDPRT", 0, "", False, "", 0, 0, 0)
    If comp Is Nothing Then gLog = gLog & "No se pudo insertar: " & nombre & vbCrLf: Exit Sub
    a(0) = 1: a(4) = 1: a(8) = 1
    a(9) = x / 1000: a(10) = y / 1000: a(11) = z / 1000
    a(12) = 1
    Set xf = mUtil.CreateTransform(a)
    comp.Transform2 = xf
    On Error Resume Next
    comp.Select2 False, 0
    asm.FixComponent
    If Err.Number <> 0 Then gLog = gLog & "No se pudo fijar: " & nombre & vbCrLf
    Err.Clear
    On Error GoTo 0
End Sub

'======================================================================
' UTILIDADES DE PIEZA
'======================================================================
Private Sub NuevaPieza()
    Set Part = swApp.NewDocument(swApp.GetUserPreferenceStringValue(swDefaultTemplatePart), 0, 0, 0)
    If Part Is Nothing Then Err.Raise 5, , "No se pudo crear la pieza"
    Part.SketchManager.AddToDB = True
    Part.SketchManager.DisplayWhenAdded = False
    Set eqMgr = Part.GetEquationMgr
    Set featOrigin = Nothing: Set plFront = Nothing: Set plTop = Nothing: Set plRight = Nothing
    FindBase
End Sub

Private Sub GuardarPieza(ByVal nombre As String)
    Dim pd As SldWorks.PartDoc, b As Variant, n As Long
    Part.ClearSelection2 True
    Part.ForceRebuild3 False
    Part.ShowNamedView2 "*Isometric", 7
    Part.ViewZoomtofit2
    Part.SketchManager.AddToDB = False
    Part.SketchManager.DisplayWhenAdded = True
    Set pd = Part
    b = pd.GetBodies2(swSolidBody, True)
    If IsEmpty(b) Then n = 0 Else n = UBound(b) + 1
    If n <> 1 Then gLog = gLog & nombre & ": solidos = " & n & " (deberia ser 1)" & vbCrLf
    Part.SaveAs3 gDir & nombre & ".SLDPRT", 0, 2
End Sub

Private Sub PropTexto(ByVal nm As String, ByVal v As String)
    Part.Extension.CustomPropertyManager("").Add3 nm, 30, v, 0
End Sub

' Cuadrilatero cerrado en Alzado (x,y modelo)
Private Sub Quad(ByVal x1 As Double, ByVal y1 As Double, ByVal x2 As Double, ByVal y2 As Double, _
                 ByVal x3 As Double, ByVal y3 As Double, ByVal x4 As Double, ByVal y4 As Double)
    LineF x1, y1, x2, y2: LineF x2, y2, x3, y3: LineF x3, y3, x4, y4: LineF x4, y4, x1, y1
End Sub

Private Sub LineF(ByVal x1 As Double, ByVal y1 As Double, ByVal x2 As Double, ByVal y2 As Double)
    Dim c1 As Variant, c2 As Variant
    c1 = ToSk(x1, y1, 0): c2 = ToSk(x2, y2, 0)
    If Part.SketchManager.CreateLine(c1(0), c1(1), 0, c2(0), c2(1), 0) Is Nothing Then gLog = gLog & "Linea no creada" & vbCrLf
End Sub

' Linea en croquis de Planta (x,z modelo, y=0)
Private Sub LineT(ByVal x1 As Double, ByVal z1 As Double, ByVal x2 As Double, ByVal z2 As Double)
    Dim c1 As Variant, c2 As Variant
    c1 = ToSk(x1, 0, z1): c2 = ToSk(x2, 0, z2)
    If Part.SketchManager.CreateLine(c1(0), c1(1), 0, c2(0), c2(1), 0) Is Nothing Then gLog = gLog & "Linea no creada" & vbCrLf
End Sub

Private Sub CenterF(ByVal x1 As Double, ByVal y1 As Double, ByVal x2 As Double, ByVal y2 As Double)
    Dim c1 As Variant, c2 As Variant
    c1 = ToSk(x1, y1, 0): c2 = ToSk(x2, y2, 0)
    If Part.SketchManager.CreateCenterLine(c1(0), c1(1), 0, c2(0), c2(1), 0) Is Nothing Then gLog = gLog & "Linea de eje no creada" & vbCrLf
End Sub

' Revolucion del croquis (con linea de eje) 360 grados
Private Function RevolveSk(ByVal sk As SldWorks.Feature, ByVal nm As String) As SldWorks.Feature
    Dim f As SldWorks.Feature
    Part.ClearSelection2 True
    sk.Select2 False, 0
    Set f = Part.FeatureManager.FeatureRevolve2(True, True, False, False, False, False, 0, 0, 6.2831853071796, 0, _
        False, False, 0.01, 0.01, 0, 0, 0, True, True, True)
    If Not f Is Nothing Then f.Name = nm
    Set RevolveSk = f
End Function

' Saliente desde desfase Z=z0 hacia +Z con comprobacion estricta de direccion
Private Function BossOffZ(ByVal sk As SldWorks.Feature, ByVal z0 As Double, ByVal depth As Double, ByVal nm As String) As SldWorks.Feature
    Dim f As SldWorks.Feature, k As Integer, bx As Variant
    For k = 0 To 3
        Part.ClearSelection2 True
        sk.Select2 False, 0
        Set f = Part.FeatureManager.FeatureExtrusion3(True, False, (k And 1) = 1, swEndCondBlind, swEndCondBlind, depth / 1000, 0, _
            False, False, False, False, 0, 0, False, False, False, False, True, True, True, swStartOffset, z0 / 1000, (k And 2) = 2)
        If f Is Nothing Then Exit For
        bx = BodyBox
        If bx(2) > -0.00001 And bx(5) > (z0 + depth) / 1000 - 0.00001 Then Exit For
        DelFeat f: Set f = Nothing
    Next
    Set BossOffZ = Named(f, nm)
End Function

' Saliente desde desfase Y=y0 hacia +Y (croquis en Planta) con comprobacion estricta
Private Function BossY(ByVal sk As SldWorks.Feature, ByVal y0 As Double, ByVal depth As Double, ByVal nm As String) As SldWorks.Feature
    Dim f As SldWorks.Feature, k As Integer, bx As Variant
    For k = 0 To 3
        Part.ClearSelection2 True
        sk.Select2 False, 0
        Set f = Part.FeatureManager.FeatureExtrusion3(True, False, (k And 1) = 1, swEndCondBlind, swEndCondBlind, depth / 1000, 0, _
            False, False, False, False, 0, 0, False, False, False, False, True, True, True, swStartOffset, y0 / 1000, (k And 2) = 2)
        If f Is Nothing Then Exit For
        bx = BodyBox
        If bx(1) > -0.00001 And bx(4) > (y0 + depth) / 1000 - 0.00001 Then Exit For
        DelFeat f: Set f = Nothing
    Next
    Set BossY = Named(f, nm)
End Function

'======================================================================
' BIBLIOTECA (patron probado, ver skill solidworks-macro-modelado)
'======================================================================
Private Sub Gv(ByVal nm As String, ByVal v As Double)
    Dim n As Long, t As String
    n = CLng(Round(v * 1000))
    If n Mod 1000 = 0 Then t = CStr(n \ 1000) Else t = "(" & CStr(n) & "/1000)"
    If eqMgr.Add2(-1, """" & nm & """ = " & t, False) < 0 Then gLog = gLog & "Variable: " & nm & vbCrLf
End Sub

' Enlaza cada cota de la operacion cuyo valor coincide con una entrada "valor=expresion"
Private Sub Link(ByVal feat As SldWorks.Feature, ByVal spec As String)
    If feat Is Nothing Then Exit Sub
    Dim it() As String, k As Integer, q As Integer
    it = Split(spec, ";")
    Dim dd As SldWorks.DisplayDimension, dm As SldWorks.Dimension, v As Double
    Set dd = feat.GetFirstDisplayDimension
    Do While Not dd Is Nothing
        Set dm = dd.GetDimension2(0)
        v = dm.SystemValue * 1000
        For k = 0 To UBound(it)
            q = InStr(it(k), "=")
            If Abs(v - Val(Left(it(k), q - 1))) < 0.002 Then
                If eqMgr.Add2(-1, """" & dm.Name & "@" & feat.Name & """ = " & Mid(it(k), q + 1), False) < 0 Then
                    gLog = gLog & "Ecuacion: " & dm.Name & "@" & feat.Name & vbCrLf
                End If
                Exit For
            End If
        Next
        Set dd = feat.GetNextDisplayDimension(dd)
    Loop
End Sub

Private Sub FindBase()
    Dim f As SldWorks.Feature, k As Integer
    Set f = Part.FirstFeature
    Do While Not f Is Nothing
        If f.GetTypeName2 = "OriginProfileFeature" Then Set featOrigin = f
        If f.GetTypeName2 = "RefPlane" Then
            k = k + 1
            If k = 1 Then Set plFront = f
            If k = 2 Then Set plTop = f
            If k = 3 Then Set plRight = f
        End If
        Set f = f.GetNextFeature
    Loop
End Sub

Private Sub Begin(ByVal pl As SldWorks.Feature)
    Dim c As Variant
    Part.ClearSelection2 True
    pl.Select2 False, 0
    Part.SketchManager.InsertSketch True
    Set gXf = Part.SketchManager.ActiveSketch.ModelToSketchTransform
    Set gXi = gXf.Inverse
    ' punto de referencia fijo en el origen (sustituye a seleccionar el origen)
    c = ToSk(0, 0, 0)
    Set gOrg = Part.SketchManager.CreatePoint(c(0), c(1), 0)
    Part.ClearSelection2 True
    gOrg.Select4 False, Nothing
    Part.SketchAddConstraints "sgFIXED"
    Part.ClearSelection2 True
End Sub

Private Function EndSk(ByVal nm As String) As SldWorks.Feature
    Part.ClearSelection2 True
    Part.SketchManager.InsertSketch True
    Set EndSk = Part.FeatureByPositionReverse(0)
    If Not EndSk Is Nothing Then EndSk.Name = nm
End Function

' modelo (mm) -> croquis (m)
Private Function ToSk(ByVal x As Double, ByVal y As Double, ByVal z As Double) As Variant
    Dim d(2) As Double, mp As SldWorks.MathPoint
    d(0) = x / 1000: d(1) = y / 1000: d(2) = z / 1000
    Set mp = mUtil.CreatePoint(d)
    ToSk = mp.MultiplyTransform(gXf).ArrayData
End Function

' croquis (m) -> modelo (m)
Private Function ToMd(ByVal u As Double, ByVal w As Double) As Variant
    Dim d(2) As Double, mp As SldWorks.MathPoint
    d(0) = u: d(1) = w: d(2) = 0
    Set mp = mUtil.CreatePoint(d)
    ToMd = mp.MultiplyTransform(gXi).ArrayData
End Function

Private Function SelOrigin() As Boolean
    SelOrigin = gOrg.Select4(True, Nothing)
    If Not SelOrigin Then gLog = gLog & "Origen no seleccionable" & vbCrLf
End Function

' Rectangulo por esquinas en coordenadas de croquis. Devuelve lineas (0 inf, 1 der, 2 sup, 3 izq).
Private Function RectSk(ByVal a As Variant, ByVal b As Variant, ByVal posDims As Boolean, ByVal rad As Double) As Variant
    Dim segs As Variant, k As Integer, ln As SldWorks.SketchLine, p1 As SldWorks.SketchPoint, p2 As SldWorks.SketchPoint
    Dim res(3) As Object, u0 As Double, u1 As Double, w0 As Double, w1 As Double
    u0 = IIf(a(0) < b(0), a(0), b(0)): u1 = IIf(a(0) < b(0), b(0), a(0))
    w0 = IIf(a(1) < b(1), a(1), b(1)): w1 = IIf(a(1) < b(1), b(1), a(1))
    segs = Part.SketchManager.CreateCornerRectangle(u0, w0, 0, u1, w1, 0)
    If IsEmpty(segs) Then gLog = gLog & "Rectangulo no creado" & vbCrLf: Exit Function
    For k = 0 To UBound(segs)
        Set ln = segs(k)
        Set p1 = ln.GetStartPoint2: Set p2 = ln.GetEndPoint2
        If Abs(p1.Y - p2.Y) < 0.000001 Then
            If Abs(p1.Y - w0) < 0.000001 Then Set res(0) = segs(k) Else Set res(2) = segs(k)
        Else
            If Abs(p1.X - u0) < 0.000001 Then Set res(3) = segs(k) Else Set res(1) = segs(k)
        End If
    Next
    DimSeg res(2), (u0 + u1) / 2, w1 + 0.006
    DimSeg res(3), u0 - 0.006, (w0 + w1) / 2
    If posDims Then
        If Abs(u0) > 0.000001 Then DimToOrigin res(3), u0 / 2, w0 - 0.008
        If Abs(w0) > 0.000001 Then DimToOrigin res(0), u0 - 0.008, w0 / 2
    End If
    If rad > 0 Then
        FilletLines res(0), res(1), rad: FilletLines res(1), res(2), rad
        FilletLines res(2), res(3), rad: FilletLines res(3), res(0), rad
    End If
    RectSk = res
End Function

' Rectangulo en plano frontal (x,y modelo)
Private Function RectF(ByVal x0 As Double, ByVal y0 As Double, ByVal x1 As Double, ByVal y1 As Double, ByVal posDims As Boolean, ByVal rad As Double) As Variant
    RectF = RectSk(ToSk(x0, y0, 0), ToSk(x1, y1, 0), posDims, rad)
End Function

Private Sub DimSeg(ByVal seg As Object, ByVal u As Double, ByVal w As Double)
    If seg Is Nothing Then Exit Sub
    Dim m As Variant
    Part.ClearSelection2 True
    seg.Select4 False, Nothing
    m = ToMd(u, w)
    If Part.AddDimension2(m(0), m(1), m(2)) Is Nothing Then gLog = gLog & "Cota no creada" & vbCrLf
    Part.ClearSelection2 True
End Sub

Private Sub DimToOrigin(ByVal seg As Object, ByVal u As Double, ByVal w As Double)
    If seg Is Nothing Then Exit Sub
    Dim m As Variant
    Part.ClearSelection2 True
    seg.Select4 False, Nothing
    If SelOrigin Then
        m = ToMd(u, w)
        If Part.AddDimension2(m(0), m(1), m(2)) Is Nothing Then gLog = gLog & "Cota a origen no creada" & vbCrLf
    End If
    Part.ClearSelection2 True
End Sub

Private Sub FilletLines(ByVal l1 As Object, ByVal l2 As Object, ByVal rad As Double)
    If l1 Is Nothing Or l2 Is Nothing Then gLog = gLog & "Linea no encontrada" & vbCrLf: Exit Sub
    Part.ClearSelection2 True
    l1.Select4 False, Nothing
    l2.Select4 True, Nothing
    If Part.SketchManager.CreateFillet(rad / 1000, 1) Is Nothing Then gLog = gLog & "Redondeo de croquis no creado" & vbCrLf
    Part.ClearSelection2 True
End Sub

' Circulo con cota de diametro; centro coincidente con el origen o acotado respecto a el
Private Sub CircleF(ByVal x As Double, ByVal y As Double, ByVal z As Double, ByVal rad As Double, ByVal onRight As Boolean)
    Dim c As Variant, seg As SldWorks.SketchSegment, arc As SldWorks.SketchArc, cp As SldWorks.SketchPoint, m As Variant
    c = ToSk(x, y, z)
    Set seg = Part.SketchManager.CreateCircleByRadius(c(0), c(1), 0, rad / 1000)
    If seg Is Nothing Then gLog = gLog & "Circulo no creado" & vbCrLf: Exit Sub
    DimSeg seg, c(0) + rad / 1000 + 0.004, c(1) + rad / 1000 + 0.004
    Set arc = seg
    Set cp = arc.GetCenterPoint2
    If Abs(c(0)) < 0.000001 And Abs(c(1)) < 0.000001 Then
        Part.ClearSelection2 True: cp.Select4 False, Nothing
        If SelOrigin Then Part.SketchAddConstraints "sgCOINCIDENT"
    Else
        If Abs(c(0)) > 0.000001 Then
            Part.ClearSelection2 True: cp.Select4 False, Nothing
            If SelOrigin Then m = ToMd(c(0) / 2, c(1) + 0.006): Part.AddHorizontalDimension2 m(0), m(1), m(2)
        End If
        If Abs(c(1)) > 0.000001 Then
            Part.ClearSelection2 True: cp.Select4 False, Nothing
            If SelOrigin Then m = ToMd(c(0) + 0.006, c(1) / 2): Part.AddVerticalDimension2 m(0), m(1), m(2)
        End If
    End If
    Part.ClearSelection2 True
End Sub

Private Function BodyBox() As Variant
    Dim pd As SldWorks.PartDoc, b As Variant
    Set pd = Part
    b = pd.GetBodies2(swSolidBody, True)
    If IsEmpty(b) Then Exit Function
    BodyBox = b(0).GetBodyBox
End Function

Private Function BodyVol() As Double
    Dim pd As SldWorks.PartDoc, b As Variant, mp As Variant
    Set pd = Part
    b = pd.GetBodies2(swSolidBody, True)
    If IsEmpty(b) Then Exit Function
    mp = b(0).GetMassProperties(1)
    BodyVol = mp(3)
End Function

Private Sub DelFeat(ByVal f As SldWorks.Feature)
    Part.ClearSelection2 True
    f.Select2 False, 0
    Part.Extension.DeleteSelection2 0
End Sub

Private Function Named(ByVal f As SldWorks.Feature, ByVal nm As String) As SldWorks.Feature
    If f Is Nothing Then gLog = gLog & "Operacion fallida: " & nm & vbCrLf Else f.Name = nm
    Set Named = f
End Function

' Saliente ciego desde el plano del croquis; comprueba que va hacia +Z y si no invierte la direccion
Private Function Boss(ByVal sk As SldWorks.Feature, ByVal depth As Double, ByVal mode As Integer, ByVal nm As String) As SldWorks.Feature
    Dim f As SldWorks.Feature, fl As Integer, bx As Variant
    For fl = 0 To 1
        Part.ClearSelection2 True
        sk.Select2 False, 0
        Set f = Part.FeatureManager.FeatureExtrusion3(True, False, fl = 1, swEndCondBlind, swEndCondBlind, depth / 1000, 0, _
            False, False, False, False, 0, 0, False, False, False, False, True, True, True, swStartSketchPlane, 0, False)
        If f Is Nothing Then Exit For
        bx = BodyBox
        If bx(2) > -0.00001 Then Exit For
        DelFeat f: Set f = Nothing
    Next
    Set Boss = Named(f, nm)
End Function

' Corte desde desfase de inicio z0 con profundidad hacia +Z (prueba direcciones hasta que quita material)
Private Function CutOff(ByVal sk As SldWorks.Feature, ByVal z0 As Double, ByVal depth As Double, ByVal nm As String) As SldWorks.Feature
    Dim f As SldWorks.Feature, v0 As Double, k As Integer
    v0 = BodyVol
    For k = 0 To 3
        Part.ClearSelection2 True
        sk.Select2 False, 0
        Set f = Part.FeatureManager.FeatureCut4(True, False, (k And 1) = 1, swEndCondBlind, swEndCondBlind, depth / 1000, 0, _
            False, False, False, False, 0, 0, False, False, False, False, False, True, True, True, True, False, _
            swStartOffset, z0 / 1000, (k And 2) = 2, False)
        If Not f Is Nothing Then
            If v0 - BodyVol > 0.0000000001 And OffsetOk(f, z0) Then Exit For
            DelFeat f: Set f = Nothing
        End If
    Next
    Set CutOff = Named(f, nm)
End Function

' Comprueba que el corte con desfase no llega a Z < z0 (direccion correcta)
Private Function OffsetOk(ByVal f As SldWorks.Feature, ByVal z0 As Double) As Boolean
    Dim fcs As Variant, k As Integer, bx As Variant, zmin As Double
    zmin = 1
    fcs = f.GetFaces
    If IsEmpty(fcs) Then OffsetOk = True: Exit Function
    For k = 0 To UBound(fcs)
        bx = fcs(k).GetBox
        If bx(2) < zmin Then zmin = bx(2)
    Next
    OffsetOk = (zmin > z0 / 1000 - 0.00001)
End Function

Private Function CutMid(ByVal sk As SldWorks.Feature, ByVal depth As Double, ByVal nm As String) As SldWorks.Feature
    Part.ClearSelection2 True
    sk.Select2 False, 0
    Set CutMid = Named(Part.FeatureManager.FeatureCut4(True, False, False, swEndCondMidPlane, swEndCondBlind, depth / 1000, 0, _
        False, False, False, False, 0, 0, False, False, False, False, False, True, True, True, True, False, _
        swStartSketchPlane, 0, False, False), nm)
End Function
